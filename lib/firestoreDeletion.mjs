import { collection, doc, getDoc, getDocs, query, where, deleteDoc, updateDoc, setDoc } from "firebase/firestore";

export function createDeletionAdapter(db, { deleteClassImages, deleteUserImages } = {}) {
  return {
    async list(path, field, value) {
      const source = collection(db, path);
      const snapshot = await getDocs(field ? query(source, where(field, "==", value)) : source);
      return snapshot.docs.map((item) => ({ id: item.id, path: item.ref.path, data: item.data() }));
    },
    async get(path) {
      const snapshot = await getDoc(doc(db, path));
      return snapshot.exists() ? snapshot.data() : null;
    },
    remove: (path) => deleteDoc(doc(db, path)),
    update: (path, data) => updateDoc(doc(db, path), data),
    set: (path, data) => setDoc(doc(db, path), data),
    async deleteClassImages(classId) {
      if (!deleteClassImages) throw new Error("이미지 삭제 연결이 준비되지 않았습니다.");
      await deleteClassImages(classId);
    },
    async deleteUserImages(uid) {
      if (!deleteUserImages) throw new Error("이미지 삭제 연결이 준비되지 않았습니다.");
      await deleteUserImages(uid);
    },
  };
}
