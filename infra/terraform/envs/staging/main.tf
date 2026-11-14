terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  backend "s3" {
    bucket       = "liveorder-tfstate-553288148257"
    key          = "staging/terraform.tfstate"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region              = "ap-southeast-1"
  allowed_account_ids = ["553288148257"]
  default_tags {
    tags = {
      Project   = "liveorder"
      Env       = "staging"
      ManagedBy = "terraform"
    }
  }
}

module "network" {
  source     = "../../modules/network"
  name       = "liveorder-staging"
  region     = "ap-southeast-1"
  azs        = ["ap-southeast-1a", "ap-southeast-1b"]
  enable_nat = false
}

module "security" {
  source    = "../../modules/security"
  name      = "liveorder-staging"
  vpc_id    = module.network.vpc_id
  app_ports = [8000, 3002]
}

module "data" {
  source          = "../../modules/data"
  name            = "liveorder-staging"
  data_subnet_ids = module.network.data_subnet_ids
  rds_sg_id       = module.security.rds_sg_id
  redis_sg_id     = module.security.redis_sg_id
  redis_tls       = true # doi false neu client Redis khong tao tu URL
}

data "aws_caller_identity" "current" {}

module "platform" {
  source        = "../../modules/platform"
  name          = "liveorder-staging"
  account_id    = data.aws_caller_identity.current.account_id
  region        = "ap-southeast-1"
  db_secret_arn = module.data.db_secret_arn
}

module "compute" {
  source                 = "../../modules/compute"
  name                   = "liveorder-staging"
  region                 = "ap-southeast-1"
  vpc_id                 = module.network.vpc_id
  app_subnet_ids         = module.network.app_subnet_ids
  ecs_sg_id              = module.security.ecs_sg_id
  execution_role_arn     = module.platform.execution_role_arn
  commerce_task_role_arn = module.platform.commerce_task_role_arn
  realtime_task_role_arn = module.platform.realtime_task_role_arn
  ecr_urls               = module.platform.ecr_urls
  db_address             = module.data.db_address
  db_port                = module.data.db_port
  db_name                = module.data.db_name
  db_secret_arn          = module.data.db_secret_arn
  redis_url              = module.data.redis_url
  secret_arns            = module.platform.commerce_secret_arns
  desired_count          = 0 # mai doi thanh 1 CUNG LUC voi enable_nat = true
}

module "edge" {
  source                = "../../modules/edge"
  name                  = "liveorder-staging"
  app_subnet_ids        = module.network.app_subnet_ids
  vpclink_sg_id         = module.security.vpclink_sg_id
  cloudmap_service_arns = module.compute.cloudmap_service_arns
}

output "api_url" {
  value = module.edge.api_url
}