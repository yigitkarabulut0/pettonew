-- name: CreateConversation :one
INSERT INTO conversations (type, name, event_id)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetConversationByID :one
SELECT * FROM conversations WHERE id = $1;

-- name: ListUserConversations :many
SELECT DISTINCT c.* FROM conversations c
JOIN conversation_members cm ON c.id = cm.conversation_id
WHERE cm.user_id = $1
ORDER BY c.updated_at DESC NULLS LAST
LIMIT $2 OFFSET $3;

-- name: CountUserConversations :one
SELECT COUNT(DISTINCT c.id) FROM conversations c
JOIN conversation_members cm ON c.id = cm.conversation_id
WHERE cm.user_id = $1;

-- name: AddConversationMember :exec
INSERT INTO conversation_members (conversation_id, user_id, pet_id)
VALUES ($1, $2, $3)
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- name: GetConversationMembers :many
SELECT cm.*, u.first_name, u.last_name, u.avatar_url as user_avatar,
       p.name as pet_name, p.avatar_url as pet_avatar
FROM conversation_members cm
JOIN users u ON cm.user_id = u.id
LEFT JOIN pets p ON cm.pet_id = p.id
WHERE cm.conversation_id = $1;

-- name: GetDMConversation :one
SELECT c.* FROM conversations c
JOIN conversation_members cm1 ON c.id = cm1.conversation_id
JOIN conversation_members cm2 ON c.id = cm2.conversation_id
WHERE c.type = 'dm' AND cm1.user_id = $1 AND cm2.user_id = $2
LIMIT 1;

-- name: CreateMessage :one
INSERT INTO messages (conversation_id, sender_id, type, content)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListMessages :many
SELECT m.*, u.first_name, u.last_name, u.avatar_url as sender_avatar
FROM messages m
JOIN users u ON m.sender_id = u.id
WHERE m.conversation_id = $1
ORDER BY m.created_at ASC
LIMIT $2 OFFSET $3;

-- name: CountMessages :one
SELECT COUNT(*) FROM messages;

-- name: CountConversationMessages :one
SELECT COUNT(*) FROM messages WHERE conversation_id = $1;

-- name: UpdateConversationTimestamp :exec
UPDATE conversations SET updated_at = NOW() WHERE id = $1;

-- name: UpdateLastReadAt :exec
UPDATE conversation_members SET last_read_at = NOW()
WHERE conversation_id = $1 AND user_id = $2;

-- name: GetUnreadCount :one
SELECT COUNT(*) FROM messages m
WHERE m.conversation_id = $1
  AND m.sender_id != $2
  AND m.created_at > COALESCE(
    (SELECT last_read_at FROM conversation_members WHERE conversation_id = $1 AND user_id = $2),
    '1970-01-01'::timestamptz
  );

-- name: IsConversationMember :one
SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2);
