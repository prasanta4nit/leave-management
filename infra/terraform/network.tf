data "aws_subnet" "private" {
  for_each = toset(var.private_subnet_ids)
  id       = each.value
}

data "aws_security_group" "database" {
  id = var.db_security_group_id
}

resource "terraform_data" "network_checks" {
  lifecycle {
    precondition {
      condition = alltrue([
        for subnet in data.aws_subnet.private : subnet.vpc_id == var.vpc_id
      ])
      error_message = "Every private_subnet_id must belong to vpc_id."
    }

    precondition {
      condition     = length(distinct([for subnet in data.aws_subnet.private : subnet.availability_zone])) >= 2
      error_message = "private_subnet_ids must cover at least two Availability Zones."
    }

    precondition {
      condition     = data.aws_security_group.database.vpc_id == var.vpc_id
      error_message = "db_security_group_id must belong to vpc_id."
    }

    precondition {
      condition     = var.db_secret_arn != "" || (var.db_username != "" && var.db_password != "")
      error_message = "Set db_username and db_password, or set db_secret_arn."
    }
  }
}

resource "aws_security_group" "lambda" {
  name        = "${local.name}-lambda"
  description = "LeaveDesk API Lambda"
  vpc_id      = var.vpc_id

  egress {
    description = "MySQL in the VPC, and AWS APIs through NAT or interface endpoints"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name}-lambda"
  }
}

resource "aws_vpc_security_group_ingress_rule" "mysql_from_lambda" {
  count = var.create_db_ingress_rule ? 1 : 0

  security_group_id            = var.db_security_group_id
  description                  = "MySQL from LeaveDesk Lambda"
  ip_protocol                  = "tcp"
  from_port                    = var.db_port
  to_port                      = var.db_port
  referenced_security_group_id = aws_security_group.lambda.id

  tags = {
    Name = "${local.name}-mysql"
  }
}

resource "aws_security_group" "endpoints" {
  count = var.create_vpc_endpoints ? 1 : 0

  name        = "${local.name}-endpoints"
  description = "Interface endpoints used by the LeaveDesk Lambda"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTPS from LeaveDesk Lambda"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }

  tags = {
    Name = "${local.name}-endpoints"
  }
}

resource "aws_vpc_endpoint" "interface" {
  for_each = var.create_vpc_endpoints ? toset(concat(
    ["email", "ssm", "logs", "cognito-idp"],
    var.db_secret_arn == "" ? [] : ["secretsmanager"],
  )) : toset([])

  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.${each.value}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.endpoints[0].id]
  private_dns_enabled = true

  tags = {
    Name = "${local.name}-${each.value}"
  }
}
