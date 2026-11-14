output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "cloudmap_service_arns" {
  value = { for k, s in aws_service_discovery_service.svc : k => s.arn }
}