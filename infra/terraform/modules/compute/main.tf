resource "aws_ecs_cluster" "this" {
  name = var.name
}

resource "aws_cloudwatch_log_group" "svc" {
  for_each          = toset(["commerce", "realtime"])
  name              = "/ecs/${var.name}/${each.key}"
  retention_in_days = 7
}

# ---------- Cloud Map ----------
resource "aws_service_discovery_private_dns_namespace" "this" {
  name = "liveorder.local"
  vpc  = var.vpc_id
}

resource "aws_service_discovery_service" "svc" {
  for_each = toset(["commerce", "realtime"])
  name     = each.key

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.this.id
    routing_policy = "MULTIVALUE"

    dns_records {
      type = "SRV"
      ttl  = 10
    }
  }
}

# ---------- Task definitions ----------
locals {
  commerce_env = concat(
    [
      { name = "PORT", value = "8000" },
      { name = "API_PREFIX", value = "/api" },
      { name = "DB_HOST", value = var.db_address },
      { name = "DB_PORT", value = tostring(var.db_port) },
      { name = "DB_NAME", value = var.db_name },
      { name = "REDIS_URL", value = var.redis_url },
      { name = "AWS_REGION", value = var.region },
      { name = "AWS_IVS_REGION", value = "ap-northeast-1" },
      { name = "ENABLE_MOCK_PAYMENT", value = "true" },
      { name = "PAYMENT_GATEWAY", value = "mock" },
      { name = "SHIPPING_CARRIER", value = "mock" },
    ],
    var.public_base_url != "" ? [{ name = "PUBLIC_BASE_URL", value = var.public_base_url }] : [],
    var.web_base_url != "" ? [{ name = "WEB_BASE_URL", value = var.web_base_url }] : [],
  )

  commerce_secrets = [
    { name = "DB_USER", valueFrom = "${var.db_secret_arn}:username::" },
    { name = "DB_PASSWORD", valueFrom = "${var.db_secret_arn}:password::" },
    { name = "SECRET_KEY", valueFrom = var.secret_arns["SECRET_KEY"] },
    { name = "MOCK_GATEWAY_SECRET", valueFrom = var.secret_arns["MOCK_GATEWAY_SECRET"] },
    { name = "MOCK_CARRIER_SECRET", valueFrom = var.secret_arns["MOCK_CARRIER_SECRET"] },
  ]

  realtime_env = [
    { name = "PORT", value = "3002" },
    { name = "REDIS_URL", value = var.redis_url },
  ]
}

resource "aws_ecs_task_definition" "commerce" {
  family                   = "${var.name}-commerce"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.commerce_task_role_arn

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name         = "commerce"
    image        = "${var.ecr_urls["commerce"]}:${var.commerce_image_tag}"
    essential    = true
    portMappings = [{ containerPort = 8000, protocol = "tcp" }]
    environment  = local.commerce_env
    secrets      = local.commerce_secrets
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:8000/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.svc["commerce"].name
        awslogs-region        = var.region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "realtime" {
  family                   = "${var.name}-realtime"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.realtime_task_role_arn

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name         = "realtime"
    image        = "${var.ecr_urls["realtime"]}:${var.realtime_image_tag}"
    essential    = true
    portMappings = [{ containerPort = 3002, protocol = "tcp" }]
    environment  = local.realtime_env
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:3002/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.svc["realtime"].name
        awslogs-region        = var.region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}

# ---------- Services ----------
resource "aws_ecs_service" "commerce" {
  name                   = "commerce"
  cluster                = aws_ecs_cluster.this.id
  task_definition        = aws_ecs_task_definition.commerce.arn
  desired_count          = var.desired_count
  launch_type            = "FARGATE"
  enable_execute_command = true

  # 1 task: dung task cu truoc, roi moi bat task moi (tranh 2 task cung migrate)
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  network_configuration {
    subnets          = var.app_subnet_ids
    security_groups  = [var.ecs_sg_id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn   = aws_service_discovery_service.svc["commerce"].arn
    container_name = "commerce"
    container_port = 8000
  }
}

resource "aws_ecs_service" "realtime" {
  name                   = "realtime"
  cluster                = aws_ecs_cluster.this.id
  task_definition        = aws_ecs_task_definition.realtime.arn
  desired_count          = var.desired_count
  launch_type            = "FARGATE"
  enable_execute_command = true

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  network_configuration {
    subnets          = var.app_subnet_ids
    security_groups  = [var.ecs_sg_id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn   = aws_service_discovery_service.svc["realtime"].arn
    container_name = "realtime"
    container_port = 3002
  }
}