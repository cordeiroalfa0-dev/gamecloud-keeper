import { createFileRoute } from "@tanstack/react-router";
import { RemoteController } from "@/components/RemoteController";

export const Route = createFileRoute("/controller")({
  component: RemoteController,
});
