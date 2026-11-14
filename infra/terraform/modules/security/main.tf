resource "aws_security_group" "vpclink" {
  name        = "${var.name}-vpclink-sg"
  description = "API Gateway VPC Link ENIs"
  vpc_id      = var.vpc_id
  tags        = { Name = "${var.name}-vpclink-sg" }
}

resource "aws_security_group" "ecs" {
  name        = "${var.name}-ecs-sg"
  description = "ECS Fargate tasks"
  vpc_id      = var.vpc_id
  tags        = { Name = "${var.name}-ecs-sg" }
}

resource "aws_security_group" "rds" {
  name        = "${var.name}-rds-sg"
  description = "RDS Postgres"
  vpc_id      = var.vpc_id
  tags        = { Name = "${var.name}-rds-sg" }
}

resource "aws_security_group" "redis" {
  name        = "${var.name}-redis-sg"
  description = "ElastiCache Redis"
  vpc_id      = var.vpc_id
  tags        = { Name = "${var.name}-redis-sg" }
}

# VPC Link -> ECS (per container port)
resource "aws_vpc_security_group_ingress_rule" "ecs_from_vpclink" {
  for_each                     = toset([for p in var.app_ports : tostring(p)])
  security_group_id            = aws_security_group.ecs.id
  referenced_security_group_id = aws_security_group.vpclink.id
  ip_protocol                  = "tcp"
  from_port                    = tonumber(each.value)
  to_port                      = tonumber(each.value)
}

# ECS -> outside (ECR, SQS, IVS, Secrets via NAT / endpoints)
resource "aws_vpc_security_group_egress_rule" "ecs_all" {
  security_group_id = aws_security_group.ecs.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# VPC Link -> ECS (egress must be allowed too)
resource "aws_vpc_security_group_egress_rule" "vpclink_to_ecs" {
  for_each                     = toset([for p in var.app_ports : tostring(p)])
  security_group_id            = aws_security_group.vpclink.id
  referenced_security_group_id = aws_security_group.ecs.id
  ip_protocol                  = "tcp"
  from_port                    = tonumber(each.value)
  to_port                      = tonumber(each.value)
}

# ECS -> RDS / Redis only
resource "aws_vpc_security_group_ingress_rule" "rds_from_ecs" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = aws_security_group.ecs.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_ecs" {
  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = aws_security_group.ecs.id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
}