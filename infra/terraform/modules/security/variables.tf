variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "app_ports" {
  type        = list(number)
  description = "Container ports for commerce and realtime"
}