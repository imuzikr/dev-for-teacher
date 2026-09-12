import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

async function loadModule({ existingPaths = [], uploadImpl, urlImpl, listImpl, deleteImpl, denyExistingBytes = false } = {}) {
  const deletedPaths = [];
  const listings = [];
  const byteCopies = [];
  const uploads = [];
  const uploadedPaths = new Set(existingPaths);
  const context = vm.createContext({ console, Map, Promise, TextEncoder, Uint8Array, URL, crypto: webcrypto });
  const source = (file) => readFileSync(new URL(`../lib/${file}.js`, import.meta.url), "utf8");
  const stub = (exports) => new vm.SyntheticModule(Object.keys(exports), function defineExports() {
    Object.entries(exports).forEach(([name, value]) => this.setExport(name, value));
  }, { context });
  const storageApi = {
    ref: (_storage, value = "") => {
      const bucket = "example-school.firebasestorage.app";
      if (value.startsWith("https://")) {
        const match = new URL(value).pathname.match(new RegExp("^/v0/b/([^/]+)/o/(.+)$"));
        if (!match) throw new Error("Invalid Storage URL");
        const path = decodeURIComponent(match[2]);
        return { path, fullPath: path, bucket: match[1] };
      }
      return { path: value, fullPath: value, bucket };
    },
    getBytes: async () => new Uint8Array([1, 2, 3]),
    uploadBytes: async (target, bytes, metadata) => {
      byteCopies.push({ path: target.path, bytes: Array.from(bytes), metadata });
      if (denyExistingBytes && uploadedPaths.has(target.path)) throw Object.assign(new Error("Immutable object already exists"), { code: "storage/unauthorized" });
      uploadedPaths.add(target.path);
    },
    deleteObject: async (target) => {
      deletedPaths.push(target.fullPath);
      if (deleteImpl) await deleteImpl(target);
      uploadedPaths.delete(target.fullPath);
    },
    list: async (target, options) => {
      listings.push({ path: target.fullPath, options });
      if (listImpl) return listImpl(target, options);
      const descendants = [...uploadedPaths].filter(path => path.startsWith(target.fullPath + "/"));
      const items = descendants.filter(path => !path.slice(target.fullPath.length + 1).includes("/"));
      const prefixes = [...new Set(descendants.filter(path => !items.includes(path)).map(path => target.fullPath + "/" + path.slice(target.fullPath.length + 1).split("/")[0]))];
      return { items: items.map(fullPath => ({ fullPath })), prefixes: prefixes.map(fullPath => ({ fullPath })) };
    },
    uploadString: async (imageRef, value, format, metadata) => {
      uploads.push({ imageRef, value, format, metadata });
      if (uploadImpl) return uploadImpl(imageRef, value, format, metadata);
      uploadedPaths.add(imageRef.path);
      return {};
    },
    getDownloadURL: async (imageRef) => {
      if (urlImpl) return urlImpl(imageRef);
      if (!uploadedPaths.has(imageRef.path)) {
        const error = new Error("not found");
        error.code = "storage/object-not-found";
        throw error;
      }
      return `https://firebasestorage.googleapis.com/v0/b/example-school.firebasestorage.app/o/${encodeURIComponent(imageRef.path)}?alt=media`;
    },
  };
  const imageModule = new vm.SourceTextModule(source("bookProjectImages"), { context });
  await imageModule.link(() => {});
  await imageModule.evaluate();
  const dependencies = {
    "./firebase": stub({ storage: {}, isFirebaseConfigured: true }),
    "firebase/storage": stub(storageApi),
    "./bookProjectImages": imageModule,
  };
  const module = new vm.SourceTextModule(source("bookProjectStorage"), { context });
  await module.link((specifier) => dependencies[specifier]);
  await module.evaluate();
  return { ...module.namespace, uploads, deletedPaths, listings, byteCopies, uploadedPaths, storedValue: value => vm.runInContext("JSON.parse", context)(JSON.stringify(value)) };
}

async function sha256Hex(value) {
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const image = "data:image/jpeg;base64,YWJj";
const otherImage = "data:image/jpeg;base64,ZGVm";
const existingUrl = "https://example.com/existing.jpg";
const user = { uid: "teacherA" };

test("uploadBookProjectImages validates every item before uploading", async () => {
  const api = await loadModule();
  const steps = [{
    id: "step1",
    activities: [{ id: "act1", title: "활동", images: [image] }],
    resources: [{ id: "res1", title: "자료", images: ["javascript:alert(1)"] }],
  }];
  await assert.rejects(api.uploadBookProjectImages(user, { classId: "classA", steps }), {
    code: "book-project/image-limit",
  });
  assert.equal(api.uploads.length, 0);
});

test("uploadBookProjectImages stores inline JPEGs at deterministic hash paths and reuses HTTPS URLs", async () => {
  const api = await loadModule();
  const steps = [{
    id: "step1",
    activities: [{ id: "act1", title: "활동", images: [image, existingUrl], imageSizes: ["large"] }],
    resources: [{ id: "res1", title: "자료", images: [otherImage], imageSizes: ["small"] }],
  }];
  const prepared = await api.uploadBookProjectImages(user, { classId: "classA", steps });
  const hash = await sha256Hex(image);
  assert.equal(api.uploads[0].imageRef.path, `book-project-images/classA/teacherA/${hash}.jpg`);
  assert.equal(api.uploads[0].format, "data_url");
  assert.equal(api.uploads[0].metadata.contentType, "image/jpeg");
  assert.equal(api.uploads[0].metadata.customMetadata.sha256, hash);
  assert.equal(prepared[0].activities[0].images[0], `https://firebasestorage.googleapis.com/v0/b/example-school.firebasestorage.app/o/${encodeURIComponent(api.uploads[0].imageRef.path)}?alt=media`);
  assert.equal(prepared[0].activities[0].images[1], existingUrl);
  assert.deepEqual(Array.from(prepared[0].activities[0].imageSizes), ["large", "medium"]);
  assert.deepEqual(Array.from(prepared[0].resources[0].imageSizes), ["small"]);
});

test("uploadBookProjectImages reuses existing hashed Storage objects without rewriting them", async () => {
  const hash = await sha256Hex(image);
  const path = `book-project-images/classA/teacherA/${hash}.jpg`;
  const api = await loadModule({ existingPaths: [path] });
  const steps = [{ id: "step1", activities: [{ id: "act1", title: "활동", images: [image] }], resources: [] }];
  const prepared = await api.uploadBookProjectImages(user, { classId: "classA", steps });
  assert.equal(api.uploads.length, 0);
  assert.equal(prepared[0].activities[0].images[0], `https://firebasestorage.googleapis.com/v0/b/example-school.firebasestorage.app/o/${encodeURIComponent(path)}?alt=media`);
});

test("uploadBookProjectImages reuses identical inline content across concurrent steps", async () => {
  const api = await loadModule();
  const steps = [{
    id: "step1",
    activities: [{ id: "act1", title: "활동", images: [image] }],
    resources: [{ id: "res1", title: "자료", images: [image] }],
  }, {
    id: "step2",
    activities: [{ id: "act2", title: "활동 2", images: [image] }],
    resources: [{ id: "res2", title: "자료 2", images: [image] }],
  }];
  const prepared = await api.uploadBookProjectImages(user, { classId: "classA", steps });
  assert.equal(api.uploads.length, 1);
  assert.equal(prepared[0].activities[0].images[0], prepared[0].resources[0].images[0]);
  assert.equal(prepared[0].activities[0].images[0], prepared[1].activities[0].images[0]);
  assert.equal(prepared[0].activities[0].images[0], prepared[1].resources[0].images[0]);
});

test("uploadBookProjectImages reports meaningful Storage failures", async () => {
  const api = await loadModule({
    uploadImpl: async () => {
      const error = new Error("denied");
      error.code = "storage/unauthorized";
      throw error;
    },
  });
  const steps = [{ id: "step1", activities: [{ id: "act1", title: "활동", images: [image] }], resources: [] }];
  await assert.rejects(api.uploadBookProjectImages(user, { classId: "classA", steps }), {
    code: "book-project/image-upload",
  });
});

test("class image deletion traverses nested prefixes and paginated responses only under the target class", async () => {
  const api = await loadModule({ listImpl: async (target, options) => {
    if (target.fullPath === "book-project-images/a" && !options.pageToken) return { prefixes: [{ fullPath: "book-project-images/a/teacher" }], items: [], nextPageToken: "second" };
    if (target.fullPath === "book-project-images/a/teacher") return { prefixes: [], items: [{ fullPath: "book-project-images/a/teacher/one.jpg" }] };
    assert.equal(options.pageToken, "second");
    return { prefixes: [], items: [{ fullPath: "book-project-images/a/two.jpg" }] };
  } });
  await api.deleteClassProjectImages("a");
  assert.deepEqual(api.deletedPaths, ["book-project-images/a/teacher/one.jpg", "book-project-images/a/two.jpg"]);
  assert.deepEqual(api.listings.map(item => item.path), ["book-project-images/a", "book-project-images/a/teacher", "book-project-images/a"]);
});

test("image deletion tolerates already missing objects but propagates permission failures", async () => {
  for (const code of ["storage/object-not-found", "storage/unauthorized"]) {
    const api = await loadModule({ existingPaths: ["book-project-images/a/teacher/one.jpg"], deleteImpl: async () => { throw Object.assign(new Error(code), { code }); } });
    if (code === "storage/object-not-found") await api.deleteClassProjectImages("a");
    else await assert.rejects(api.deleteClassProjectImages("a"), { code });
  }
});

test("user image deletion preserves other owners across classes", async () => {
  const api = await loadModule({ existingPaths: ["book-project-images/a/target/one.jpg", "book-project-images/a/other/two.jpg", "book-project-images/b/target/three.jpg"] });
  await api.deleteUserProjectImages("target");
  assert.deepEqual(api.deletedPaths.sort(), ["book-project-images/a/target/one.jpg", "book-project-images/b/target/three.jpg"]);
  assert.deepEqual([...api.uploadedPaths], ["book-project-images/a/other/two.jpg"]);
});

test("managed images copied between classes are stored independently before source deletion", async () => {
  const hash = "a".repeat(64);
  const source = `book-project-images/source/teacher/${hash}.jpg`;
  const api = await loadModule({ existingPaths: [source] });
  const url = `https://firebasestorage.googleapis.com/v0/b/example-school.firebasestorage.app/o/${encodeURIComponent(source)}?alt=media`;
  const copied = await api.copyManagedProjectImage(url, "destination", "teacher");
  assert.equal(api.byteCopies.length, 1);
  assert.equal(api.byteCopies[0].path, `book-project-images/destination/teacher/${hash}.jpg`);
  assert.notEqual(copied, url);
  await api.deleteClassProjectImages("source");
  assert.equal(api.uploadedPaths.has(`book-project-images/destination/teacher/${hash}.jpg`), true);
  assert.equal(await api.copyManagedProjectImage(copied, "destination", "teacher"), copied);
  assert.equal(api.byteCopies.length, 1);
});

test("image deletion rejects invalid scope IDs without listing Storage", async () => {
  const api = await loadModule();
  await assert.rejects(api.deleteClassProjectImages("a/other"));
  await assert.rejects(api.deleteUserProjectImages(""));
  assert.equal(api.listings.length, 0);
});

test("class deletion preservation rewrites nested copied project and flattened references once", async () => {
  const hash = "b".repeat(64);
  const path = `book-project-images/source/teacher/${hash}.jpg`;
  const url = `https://firebasestorage.googleapis.com/v0/b/example-school.firebasestorage.app/o/${encodeURIComponent(path)}?alt=media`;
  const api = await loadModule({ existingPaths: [path] });
  const records = {
    bookProjects: [
      { path: "bookProjects/source", data: api.storedValue({ classId: "source", steps: [{ images: [url] }] }) },
      { path: "bookProjects/destination", data: api.storedValue({ classId: "destination", steps: [{ images: [url] }], title: "Keep title" }) },
    ],
    bookActivities: [{ path: "bookActivities/copied", data: api.storedValue({ classId: "destination", images: [url] }) }],
    bookResources: [],
  };
  const updates = [];
  await api.preserveCopiedClassImages({
    list: async collection => records[collection],
    update: async (path, data) => updates.push({ path, data }),
  }, "source", "teacher");
  assert.deepEqual(updates.map(item => item.path), ["bookProjects/destination", "bookActivities/copied"]);
  assert.equal(api.byteCopies.length, 1);
  assert.equal(updates[0].data.title, "Keep title");
  assert.notEqual(updates[0].data.steps[0].images[0], url);
  assert.equal(updates[0].data.steps[0].images[0], updates[1].data.images[0]);
});

test("concurrent repeated managed images share one copy when destination objects cannot be overwritten", async () => {
  const source = `book-project-images/source/teacher/${"c".repeat(64)}.jpg`;
  const url = `https://firebasestorage.googleapis.com/v0/b/example-school.firebasestorage.app/o/${encodeURIComponent(source)}?alt=media`;
  const api = await loadModule({ existingPaths: [source], denyExistingBytes: true });
  const steps = ["one", "two"].map(id => ({
    id,
    activities: [{ id: `${id}-a`, title: "Activity", images: [url, url] }],
    resources: [{ id: `${id}-r`, title: "Resource", images: [url] }],
  }));
  const saved = await api.uploadBookProjectImages(user, { classId: "destination", steps });
  assert.equal(api.byteCopies.length, 1);
  const copied = saved[0].activities[0].images[0];
  assert.notEqual(copied, url);
  for (const step of saved) {
    assert.deepEqual(Array.from(step.activities[0].images), [copied, copied]);
    assert.deepEqual(Array.from(step.resources[0].images), [copied]);
  }
});

test("independent managed copy attempts reuse the winner when immutable uploads race", async () => {
  const source = `book-project-images/source/teacher/${"d".repeat(64)}.jpg`;
  const url = `https://firebasestorage.googleapis.com/v0/b/example-school.firebasestorage.app/o/${encodeURIComponent(source)}?alt=media`;
  const api = await loadModule({ existingPaths: [source], denyExistingBytes: true });
  const results = await Promise.all([
    api.copyManagedProjectImage(url, "destination", user.uid),
    api.copyManagedProjectImage(url, "destination", user.uid),
  ]);
  assert.equal(results[0], results[1]);
  assert.notEqual(results[0], url);
  assert.equal(api.uploadedPaths.size, 2);
});
