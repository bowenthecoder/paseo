import { useCallback, type ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ArrowUp, Pencil, X } from "lucide-react-native";
import type { QueuedComposerMessage } from "@/composer/actions";
import { ICON_SIZE, type Theme } from "@/styles/theme";

export interface QueueTrackLabels {
  edit: string;
  sendNow: string;
  remove: string;
  held: string;
  sendAll: string;
}

export interface RenderQueueTrackArgs {
  queuedMessages: readonly QueuedComposerMessage[];
  handleEditQueuedMessage: (id: string) => void;
  handleSendQueuedNow: (id: string) => void;
  handleRemoveQueuedMessage: (id: string) => void;
  handleSendAllHeldMessages: () => void;
  labels: QueueTrackLabels;
}

/**
 * The queue above the input. Automatically queued messages leave on their own when the agent's
 * turn ends; held ones only leave through "Send now" or "Send all", so they carry a badge and
 * bring the "Send all" control with them.
 */
export function renderQueueTrack(args: RenderQueueTrackArgs): ReactElement | null {
  const {
    queuedMessages,
    handleEditQueuedMessage,
    handleSendQueuedNow,
    handleRemoveQueuedMessage,
    handleSendAllHeldMessages,
    labels,
  } = args;
  if (queuedMessages.length === 0) return null;
  const hasHeldMessages = queuedMessages.some((item) => item.hold === true);
  return (
    <View style={styles.queueTrack} testID="composer-queue-track">
      {queuedMessages.map((item) => (
        <QueuedMessageRow
          key={item.id}
          item={item}
          onEdit={handleEditQueuedMessage}
          onSendNow={handleSendQueuedNow}
          onRemove={handleRemoveQueuedMessage}
          labels={labels}
        />
      ))}
      {hasHeldMessages ? (
        <Pressable
          onPress={handleSendAllHeldMessages}
          style={styles.queueSendAllButton}
          accessibilityLabel={labels.sendAll}
          accessibilityRole="button"
          testID="composer-queue-send-all"
        >
          <Text style={styles.queueSendAllLabel}>{labels.sendAll}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface QueuedMessageRowProps {
  item: QueuedComposerMessage;
  onEdit: (id: string) => void;
  onSendNow: (id: string) => void;
  onRemove: (id: string) => void;
  labels: QueueTrackLabels;
}

function QueuedMessageRow({ item, onEdit, onSendNow, onRemove, labels }: QueuedMessageRowProps) {
  const handleEdit = useCallback(() => {
    onEdit(item.id);
  }, [onEdit, item.id]);
  const handleSendNow = useCallback(() => {
    onSendNow(item.id);
  }, [onSendNow, item.id]);
  const handleRemove = useCallback(() => {
    onRemove(item.id);
  }, [onRemove, item.id]);
  return (
    <View style={styles.queueItem} testID="composer-queued-message">
      {item.hold === true ? (
        <Text style={styles.queueHeldBadge} testID="composer-queued-message-held">
          {labels.held}
        </Text>
      ) : null}
      <Text style={styles.queueText} numberOfLines={2} ellipsizeMode="tail">
        {item.text}
      </Text>
      <View style={styles.queueActions}>
        <Pressable
          onPress={handleEdit}
          style={styles.queueActionButton}
          accessibilityLabel={labels.edit}
          accessibilityRole="button"
        >
          <ThemedPencil size={ICON_SIZE.sm} uniProps={iconForegroundMapping} />
        </Pressable>
        <Pressable
          onPress={handleRemove}
          style={styles.queueActionButton}
          accessibilityLabel={labels.remove}
          accessibilityRole="button"
        >
          <ThemedX size={ICON_SIZE.sm} uniProps={iconForegroundMapping} />
        </Pressable>
        <Pressable
          onPress={handleSendNow}
          style={[styles.queueActionButton, styles.queueSendButton]}
          accessibilityLabel={labels.sendNow}
          accessibilityRole="button"
        >
          <ThemedArrowUp size={ICON_SIZE.sm} uniProps={iconAccentForegroundMapping} />
        </Pressable>
      </View>
    </View>
  );
}

const ThemedPencil = withUnistyles(Pencil);
const ThemedArrowUp = withUnistyles(ArrowUp);
const ThemedX = withUnistyles(X);

const iconForegroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const iconAccentForegroundMapping = (theme: Theme) => ({ color: theme.colors.accentForeground });

const styles = StyleSheet.create((theme: Theme) => ({
  queueTrack: {
    flexDirection: "column",
    gap: theme.spacing[2],
  },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    gap: theme.spacing[2],
  },
  queueHeldBadge: {
    color: theme.colors.mutedForeground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    textTransform: "uppercase",
  },
  queueText: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  queueActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  queueActionButton: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
  },
  queueSendButton: {
    backgroundColor: theme.colors.accent,
  },
  queueSendAllButton: {
    alignSelf: "flex-end",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
  },
  queueSendAllLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
})) as unknown as Record<string, object>;
