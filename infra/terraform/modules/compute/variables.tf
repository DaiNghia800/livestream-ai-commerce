variable "name" {
  type = string
}

variable "region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "app_subnet_ids" {
  type = list(string)
}

variable "ecs_sg_id" {
  type = string
}

variable "execution_role_arn" {
  type = string
}

variable "commerce_task_role_arn" {
  type = string
}

variable "realtime_task_role_arn" {
  type = string
}

variable "ecr_urls" {
  type = map(string)
}

variable "commerce_image_tag" {
  type    = string
  default = "v2"
}

variable "realtime_image_tag" {
  type    = string
  default = "v1"
}

variable "db_address" {
  type = string
}

variable "db_port" {
  type = number
}

variable "db_name" {
  type = string
}

variable "db_secret_arn" {
  type = string
}

variable "redis_url" {
  type = string
}

variable "secret_arns" {
  type = map(string)
}

variable "public_base_url" {
  type    = string
  default = ""
}

variable "web_base_url" {
  type    = string
  default = ""
}

variable "desired_count" {
  type    = number
  default = 0
}