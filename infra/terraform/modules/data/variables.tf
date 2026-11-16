variable "name" {
  type = string
}

variable "data_subnet_ids" {
  type = list(string)
}

variable "rds_sg_id" {
  type = string
}

variable "redis_sg_id" {
  type = string
}

variable "redis_tls" {
  type    = bool
  default = true
}

variable "deletion_protection" {
  type    = bool
  default = true
}