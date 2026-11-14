variable "name" {
  type = string
}

variable "app_subnet_ids" {
  type = list(string)
}

variable "vpclink_sg_id" {
  type = string
}

variable "cloudmap_service_arns" {
  type = map(string)
}

variable "cors_origins" {
  type    = list(string)
  default = ["*"]
}