/**
 * Return whether a video metadata path names a direct child of its owner's
 * Storage prefix. This mirrors firestore.rules' videos.create constraint.
 */
function isVideoPathOwnedByUid(path, uid) {
    if (typeof path !== 'string' || typeof uid !== 'string' || uid.length === 0) {
        return false;
    }

    const prefix = `videos/${uid}/`;
    const objectName = path.slice(prefix.length);
    return path.startsWith(prefix) && objectName.length > 0 && !objectName.includes('/');
}

module.exports = { isVideoPathOwnedByUid };
