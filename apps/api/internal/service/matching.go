package service

func IsMutualLike(existingDirection string, incomingDirection string) bool {
	return (incomingDirection == "like" || incomingDirection == "super-like") &&
		(existingDirection == "like" || existingDirection == "super-like")
}

