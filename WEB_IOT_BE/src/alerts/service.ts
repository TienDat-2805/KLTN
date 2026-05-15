import { AlertSeverity, Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";
import { getIO, userRoom } from "../realtime/io";

type CreateAlertInput = {
  deviceId: string;
  userId?: string | null;
  type: string;
  severity?: AlertSeverity;
  title: string;
  message: string;
  metadata?: unknown;
};

export async function createDeviceAlert(input: CreateAlertInput) {
  const alert = await prisma.deviceAlert.create({
    data: {
      deviceId: input.deviceId,
      userId: input.userId ?? null,
      type: input.type,
      severity: input.severity ?? AlertSeverity.WARNING,
      title: input.title,
      message: input.message,
      metadata: input.metadata as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      deviceId: true,
      userId: true,
      type: true,
      severity: true,
      title: true,
      message: true,
      metadata: true,
      isRead: true,
      readAt: true,
      createdAt: true,
    },
  });

  if (alert.userId) {
    getIO()?.to(userRoom(alert.userId)).emit("alert:new", {
      id: alert.id,
      deviceId: alert.deviceId,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      metadata: alert.metadata,
      isRead: alert.isRead,
      readAt: alert.readAt,
      createdAt: alert.createdAt,
    });
  }

  return alert;
}
