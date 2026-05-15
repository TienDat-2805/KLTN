import { DeviceCommandStatus, Prisma } from "@prisma/client";

import { env } from "../env";
import { prisma } from "../db/prisma";
import { getIO, userRoom } from "../realtime/io";

type CreateCommandInput = {
  deviceId?: string | null;
  userId?: string | null;
  deviceUid: string;
  topic: string;
  type: string;
  payload: unknown;
};

function emitCommandStatus(input: {
  userId?: string | null;
  commandId: string;
  deviceId?: string | null;
  status: DeviceCommandStatus;
  error?: string | null;
}) {
  if (!input.userId) return;

  getIO()?.to(userRoom(input.userId)).emit("command:status", {
    commandId: input.commandId,
    deviceId: input.deviceId ?? null,
    status: input.status,
    error: input.error ?? null,
  });
}

export async function createDeviceCommand(input: CreateCommandInput) {
  return prisma.deviceCommand.create({
    data: {
      deviceId: input.deviceId ?? null,
      userId: input.userId ?? null,
      deviceUid: input.deviceUid,
      topic: input.topic,
      type: input.type,
      payload: input.payload as Prisma.InputJsonValue,
      status: DeviceCommandStatus.PENDING,
    },
    select: {
      id: true,
      deviceId: true,
      userId: true,
      status: true,
    },
  });
}

export async function markDeviceCommandSent(commandId: string) {
  const command = await prisma.deviceCommand.update({
    where: { id: commandId },
    data: {
      status: DeviceCommandStatus.SENT,
      sentAt: new Date(),
    },
    select: {
      id: true,
      deviceId: true,
      userId: true,
      status: true,
    },
  });

  emitCommandStatus({
    userId: command.userId,
    commandId: command.id,
    deviceId: command.deviceId,
    status: command.status,
  });

  scheduleCommandTimeout(command.id);
  return command;
}

export async function markDeviceCommandFailed(
  commandId: string,
  error: string,
) {
  const command = await prisma.deviceCommand.update({
    where: { id: commandId },
    data: {
      status: DeviceCommandStatus.FAILED,
      error: error.slice(0, 500),
    },
    select: {
      id: true,
      deviceId: true,
      userId: true,
      status: true,
      error: true,
    },
  });

  emitCommandStatus({
    userId: command.userId,
    commandId: command.id,
    deviceId: command.deviceId,
    status: command.status,
    error: command.error,
  });

  return command;
}

export async function markDeviceCommandAcked(input: {
  commandId: string;
  deviceUid?: string | null;
  ackPayload: Prisma.InputJsonValue;
}) {
  const command = await prisma.deviceCommand.findUnique({
    where: { id: input.commandId },
    select: {
      id: true,
      deviceId: true,
      userId: true,
      deviceUid: true,
      status: true,
    },
  });

  if (!command) return null;

  if (
    input.deviceUid &&
    command.deviceUid.trim() !== input.deviceUid.trim()
  ) {
    return null;
  }

  if (
    command.status === DeviceCommandStatus.ACKED ||
    command.status === DeviceCommandStatus.FAILED
  ) {
    return command;
  }

  const updated = await prisma.deviceCommand.update({
    where: { id: command.id },
    data: {
      status: DeviceCommandStatus.ACKED,
      ackPayload: input.ackPayload,
      ackAt: new Date(),
      error: null,
      timedOutAt: null,
    },
    select: {
      id: true,
      deviceId: true,
      userId: true,
      status: true,
    },
  });

  emitCommandStatus({
    userId: updated.userId,
    commandId: updated.id,
    deviceId: updated.deviceId,
    status: updated.status,
  });

  return updated;
}

function scheduleCommandTimeout(commandId: string) {
  const timeout = setTimeout(() => {
    void markCommandTimedOut(commandId).catch((err) => {
      console.error(
        "[commandTimeout] failed",
        err instanceof Error ? err.message : err,
      );
    });
  }, Math.max(1000, env.DEVICE_COMMAND_ACK_TIMEOUT_MS));

  timeout.unref?.();
}

async function markCommandTimedOut(commandId: string) {
  const command = await prisma.deviceCommand.findUnique({
    where: { id: commandId },
    select: {
      id: true,
      deviceId: true,
      userId: true,
      status: true,
    },
  });

  if (!command || command.status !== DeviceCommandStatus.SENT) return null;

  const updated = await prisma.deviceCommand.update({
    where: { id: command.id },
    data: {
      status: DeviceCommandStatus.TIMEOUT,
      timedOutAt: new Date(),
      error: "Device command ACK timeout",
    },
    select: {
      id: true,
      deviceId: true,
      userId: true,
      status: true,
      error: true,
    },
  });

  emitCommandStatus({
    userId: updated.userId,
    commandId: updated.id,
    deviceId: updated.deviceId,
    status: updated.status,
    error: updated.error,
  });

  return updated;
}
