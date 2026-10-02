variable "aws_region" {
  type        = string
  description = "Region for Cognito, Lambda, API Gateway, and CloudFront's API origin."
}

variable "stage" {
  type        = string
  default     = "prod"
  description = "Name suffix for resources, for example prod."

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.stage))
    error_message = "stage must be lowercase letters, numbers, and hyphens."
  }
}

variable "timezone" {
  type        = string
  default     = "Asia/Kolkata"
  description = "IANA timezone for accrual, reminder, and year-end schedules."
}

variable "vpc_id" {
  type        = string
  description = "VPC that already contains the MySQL database."
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "At least two private subnets in different Availability Zones. They need a NAT gateway, or create_vpc_endpoints, so the Lambda can reach Secrets Manager, SES, SSM, and Cognito."

  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "Provide at least two private subnets in different Availability Zones."
  }
}

variable "db_security_group_id" {
  type        = string
  description = "Security group attached to the existing MySQL instance. Employee Desk adds an inbound rule for the Lambda on db_port."
}

variable "create_db_ingress_rule" {
  type        = bool
  default     = true
  description = "Add a MySQL ingress rule on db_security_group_id for the Lambda security group. Turn off if that group is managed outside this stack."
}

variable "db_secret_arn" {
  type        = string
  default     = ""
  description = "Optional. Secrets Manager ARN whose JSON has username and password. Leave empty and set db_username and db_password instead."

  validation {
    condition     = var.db_secret_arn == "" || startswith(var.db_secret_arn, "arn:aws:secretsmanager:")
    error_message = "db_secret_arn must be empty or a Secrets Manager secret ARN."
  }
}

variable "db_username" {
  type        = string
  default     = ""
  description = "MySQL user for the existing database. Required when db_secret_arn is empty."
}

variable "db_password" {
  type        = string
  default     = ""
  sensitive   = true
  description = "MySQL password for db_username. Required when db_secret_arn is empty."
}

variable "db_kms_key_arn" {
  type        = string
  default     = ""
  description = "CMK ARN if the database secret is not encrypted with the AWS-managed Secrets Manager key. Leave empty otherwise."
}

variable "db_host" {
  type        = string
  description = "Hostname of the existing MySQL instance. Use the private endpoint, not a public address."
}

variable "db_port" {
  type        = number
  default     = 3306
  description = "MySQL port on the existing instance."

  validation {
    condition     = var.db_port > 0 && var.db_port < 65536
    error_message = "db_port must be a TCP port."
  }
}

variable "db_name" {
  type        = string
  default     = "leave_mgmt"
  description = "Existing MySQL database (schema) name. Tables are already created; bootstrap only inserts missing policies, calendars, and the first admin."
}

variable "ses_region" {
  type        = string
  default     = ""
  description = "Region of the existing SES identity. Empty means the same as aws_region. A different region requires a NAT gateway; a same-region interface endpoint cannot send cross-region SES."
}

variable "ses_sender" {
  type        = string
  description = "From address on the existing verified SES identity, for example Employee Desk <leave@yourcompany.com>."
}

variable "ses_identity_arn" {
  type        = string
  default     = ""
  description = "ARN of the existing SES identity (arn:aws:ses:REGION:ACCOUNT:identity/domain-or-email). When set, Cognito invite mail is sent through that identity. When empty, Cognito uses its built-in email and the app still sends notifications through ses_sender."

  validation {
    condition     = var.ses_identity_arn == "" || startswith(var.ses_identity_arn, "arn:aws:ses:")
    error_message = "ses_identity_arn must be empty or an SES identity ARN."
  }
}

variable "create_vpc_endpoints" {
  type        = bool
  default     = false
  description = "Create interface endpoints for Secrets Manager, SES, SSM, CloudWatch Logs, and Cognito. Use this only when the private subnets have no NAT gateway. Each endpoint is billed per Availability Zone."
}

variable "lambda_memory_mb" {
  type        = number
  default     = 512
  description = "Lambda memory in MB."
}

variable "lambda_timeout_seconds" {
  type        = number
  default     = 60
  description = "Lambda timeout. API Gateway still stops HTTP requests at 30 seconds; the extra time is for bootstrap and scheduled jobs."
}

variable "log_retention_days" {
  type        = number
  default     = 30
  description = "CloudWatch Logs retention for the API function."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Extra tags applied to every resource."
}
