import { db } from '../firebase-config.js';
import { collection, query, where, onSnapshot } from "firebase/firestore";

export function initCompSync(uid, callback) {
    if (!uid || typeof callback !== 'function') return null;

    const q = query(
        collection(db, "comp_rounds"),
        where("uid", "==", uid)
    );

    return onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            callback([]);
            return;
        }

        const data = [];
        snapshot.forEach((doc) => {
            data.push({ id: doc.id, ...doc.data() });
        });

        callback(data);
    }, (error) => {
        console.error("[CompSync] Error fetching live comp data:", error);
    });
}
