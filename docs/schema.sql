CREATE TABLE departments (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(100) NOT NULL, 
	code VARCHAR(20) NOT NULL, 
	description VARCHAR(255), 
	head_id INTEGER, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (name), 
	UNIQUE (code)
);

CREATE TABLE designations (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(100) NOT NULL, 
	level INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (name)
);

CREATE TABLE leave_types (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	code VARCHAR(20) NOT NULL, 
	name VARCHAR(60) NOT NULL, 
	description VARCHAR(255), 
	color VARCHAR(9) NOT NULL, 
	is_paid BOOL NOT NULL, 
	is_unlimited BOOL NOT NULL, 
	annual_quota NUMERIC(6, 2) NOT NULL, 
	accrual_frequency VARCHAR(20) NOT NULL, 
	prorate_on_joining BOOL NOT NULL, 
	carry_forward_enabled BOOL NOT NULL, 
	max_carry_forward NUMERIC(6, 2) NOT NULL, 
	allow_half_day BOOL NOT NULL, 
	allow_negative_balance BOOL NOT NULL, 
	allow_backdated BOOL NOT NULL, 
	min_notice_days INTEGER NOT NULL, 
	max_consecutive_days INTEGER, 
	country_codes JSON, 
	is_active BOOL NOT NULL, 
	sort_order INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (code)
);

CREATE TABLE holiday_calendars (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(100) NOT NULL, 
	country_code VARCHAR(2), 
	description VARCHAR(255), 
	weekend_days JSON, 
	is_default BOOL NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (name)
);

CREATE INDEX ix_holiday_calendars_country_code ON holiday_calendars (country_code);

CREATE TABLE system_settings (
	`key` VARCHAR(60) NOT NULL, 
	value TEXT NOT NULL, 
	PRIMARY KEY (`key`)
);

CREATE TABLE employees (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	employee_code VARCHAR(20) NOT NULL, 
	cognito_sub VARCHAR(64), 
	first_name VARCHAR(60) NOT NULL, 
	last_name VARCHAR(60) NOT NULL, 
	email VARCHAR(190) NOT NULL, 
	phone VARCHAR(30), 
	gender VARCHAR(20), 
	date_of_birth DATE, 
	designation_id INTEGER, 
	department_id INTEGER, 
	manager_id INTEGER, 
	`role` VARCHAR(20) NOT NULL, 
	employment_type VARCHAR(20) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	joining_date DATE NOT NULL, 
	exit_date DATE, 
	location VARCHAR(100), 
	country_code VARCHAR(2), 
	holiday_calendar_id INTEGER, 
	address VARCHAR(255), 
	emergency_contact_name VARCHAR(100), 
	emergency_contact_phone VARCHAR(30), 
	bio TEXT, 
	avatar_url VARCHAR(500), 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (employee_code), 
	UNIQUE (cognito_sub), 
	UNIQUE (email), 
	FOREIGN KEY(designation_id) REFERENCES designations (id) ON DELETE SET NULL, 
	FOREIGN KEY(department_id) REFERENCES departments (id) ON DELETE SET NULL, 
	FOREIGN KEY(manager_id) REFERENCES employees (id) ON DELETE SET NULL, 
	FOREIGN KEY(holiday_calendar_id) REFERENCES holiday_calendars (id) ON DELETE SET NULL
);

CREATE INDEX ix_employees_status ON employees (status);

CREATE INDEX ix_employees_country_code ON employees (country_code);

CREATE TABLE holidays (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	calendar_id INTEGER NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	date DATE NOT NULL, 
	is_optional BOOL NOT NULL, 
	description VARCHAR(255), 
	PRIMARY KEY (id), 
	CONSTRAINT uq_holiday UNIQUE (calendar_id, date, name), 
	FOREIGN KEY(calendar_id) REFERENCES holiday_calendars (id) ON DELETE CASCADE
);

CREATE INDEX ix_holidays_calendar_id ON holidays (calendar_id);

CREATE INDEX ix_holidays_date ON holidays (date);

CREATE TABLE leave_balances (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	employee_id INTEGER NOT NULL, 
	leave_type_id INTEGER NOT NULL, 
	year INTEGER NOT NULL, 
	allocated NUMERIC(6, 2) NOT NULL, 
	accrued NUMERIC(6, 2) NOT NULL, 
	carried_forward NUMERIC(6, 2) NOT NULL, 
	adjusted NUMERIC(6, 2) NOT NULL, 
	last_accrual_month INTEGER NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_balance UNIQUE (employee_id, leave_type_id, year), 
	FOREIGN KEY(employee_id) REFERENCES employees (id) ON DELETE CASCADE, 
	FOREIGN KEY(leave_type_id) REFERENCES leave_types (id) ON DELETE CASCADE
);

CREATE TABLE leave_requests (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	employee_id INTEGER NOT NULL, 
	leave_type_id INTEGER NOT NULL, 
	start_date DATE NOT NULL, 
	end_date DATE NOT NULL, 
	duration_type VARCHAR(20) NOT NULL, 
	half_day_session VARCHAR(20), 
	total_days NUMERIC(6, 2) NOT NULL, 
	reason VARCHAR(1000), 
	status VARCHAR(20) NOT NULL, 
	approval_stage VARCHAR(20), 
	current_approver_id INTEGER, 
	decided_by_id INTEGER, 
	decided_at DATETIME, 
	decision_comment VARCHAR(500), 
	applied_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	cancelled_at DATETIME, 
	cancel_reason VARCHAR(500), 
	reminder_sent_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(employee_id) REFERENCES employees (id) ON DELETE CASCADE, 
	FOREIGN KEY(leave_type_id) REFERENCES leave_types (id), 
	FOREIGN KEY(current_approver_id) REFERENCES employees (id) ON DELETE SET NULL, 
	FOREIGN KEY(decided_by_id) REFERENCES employees (id) ON DELETE SET NULL
);

CREATE INDEX ix_leave_emp_dates ON leave_requests (employee_id, start_date, end_date);

CREATE INDEX ix_leave_requests_status ON leave_requests (status);

CREATE TABLE wfh_requests (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	employee_id INTEGER NOT NULL, 
	start_date DATE NOT NULL, 
	end_date DATE NOT NULL, 
	total_days NUMERIC(6, 2) NOT NULL, 
	reason VARCHAR(1000), 
	status VARCHAR(20) NOT NULL, 
	approval_stage VARCHAR(20), 
	current_approver_id INTEGER, 
	decided_by_id INTEGER, 
	decided_at DATETIME, 
	decision_comment VARCHAR(500), 
	applied_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	cancelled_at DATETIME, 
	cancel_reason VARCHAR(500), 
	reminder_sent_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(employee_id) REFERENCES employees (id) ON DELETE CASCADE, 
	FOREIGN KEY(current_approver_id) REFERENCES employees (id) ON DELETE SET NULL, 
	FOREIGN KEY(decided_by_id) REFERENCES employees (id) ON DELETE SET NULL
);

CREATE INDEX ix_wfh_requests_status ON wfh_requests (status);

CREATE TABLE request_history (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	request_kind VARCHAR(20) NOT NULL, 
	request_id INTEGER NOT NULL, 
	action VARCHAR(30) NOT NULL, 
	from_status VARCHAR(20), 
	to_status VARCHAR(20), 
	actor_id INTEGER, 
	comment VARCHAR(1000), 
	is_override BOOL NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(actor_id) REFERENCES employees (id) ON DELETE SET NULL
);

CREATE INDEX ix_history_request ON request_history (request_kind, request_id);

CREATE TABLE optional_holiday_selections (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	employee_id INTEGER NOT NULL, 
	holiday_id INTEGER NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_opt_holiday UNIQUE (employee_id, holiday_id), 
	FOREIGN KEY(employee_id) REFERENCES employees (id) ON DELETE CASCADE, 
	FOREIGN KEY(holiday_id) REFERENCES holidays (id) ON DELETE CASCADE
);

CREATE TABLE audit_logs (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	actor_id INTEGER, 
	entity VARCHAR(40) NOT NULL, 
	entity_id VARCHAR(40), 
	action VARCHAR(40) NOT NULL, 
	details TEXT, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(actor_id) REFERENCES employees (id) ON DELETE SET NULL
);

CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at);

ALTER TABLE departments ADD FOREIGN KEY(head_id) REFERENCES employees (id) ON DELETE SET NULL;

