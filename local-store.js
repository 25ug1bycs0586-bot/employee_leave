const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const databaseFile = path.join(__dirname, "data", "leavewise.json");
const collections = {
  users: [],
  leaves: [],
  departments: [],
};
let writeQueue = Promise.resolve();

function getValue(object, key) {
  return key.split(".").reduce((value, part) => value?.[part], object);
}

function setValue(object, key, value) {
  const parts = key.split(".");
  const finalKey = parts.pop();
  let parent = object;
  for (const part of parts) {
    if (!parent[part] || typeof parent[part] !== "object") parent[part] = {};
    parent = parent[part];
  }
  parent[finalKey] = value;
}

function comparable(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const time = Date.parse(value);
    if (!Number.isNaN(time)) return time;
  }
  return value;
}

function matches(document, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = getValue(document, key);
    if (expected && typeof expected === "object" && !(expected instanceof Date) && !Array.isArray(expected)) {
      return Object.entries(expected).every(([operator, value]) => {
        const left = comparable(actual);
        const right = comparable(value);
        if (operator === "$ne") return String(actual) !== String(value);
        if (operator === "$gte") return left >= right;
        if (operator === "$lte") return left <= right;
        return false;
      });
    }
    if (key === "_id" || key.endsWith("._id")) return String(actual) === String(expected);
    return actual === expected;
  });
}

function applyUpdate(document, update, inserting = false) {
  for (const [operator, values] of Object.entries(update)) {
    if (operator === "$set" || (inserting && operator === "$setOnInsert")) {
      for (const [key, value] of Object.entries(values)) setValue(document, key, value);
    } else if (operator === "$inc") {
      for (const [key, value] of Object.entries(values)) {
        setValue(document, key, Number(getValue(document, key) || 0) + Number(value));
      }
    } else if (!operator.startsWith("$")) {
      setValue(document, operator, values);
    }
  }
}

async function persist() {
  const temporary = `${databaseFile}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(collections, null, 2), "utf8");
  await fs.rename(temporary, databaseFile);
}

function queuePersist() {
  writeQueue = writeQueue.then(persist);
  return writeQueue;
}

function createDocument(model, source) {
  return new LocalDocument(model, source);
}

class LocalDocument {
  constructor(model, source) {
    Object.defineProperty(this, "_model", { value: model });
    Object.assign(this, structuredClone(source));
  }

  set(key, value) {
    setValue(this, key, value);
  }

  async save() {
    const documents = collections[this._model.collection];
    const plain = this.toObject();
    const existingIndex = documents.findIndex((entry) => entry._id === String(this._id));
    await this._model.checkUnique(plain, String(this._id));
    if (existingIndex < 0) documents.push(plain);
    else documents[existingIndex] = plain;
    await queuePersist();
    return this;
  }

  async deleteOne() {
    const documents = collections[this._model.collection];
    const index = documents.findIndex((entry) => entry._id === String(this._id));
    if (index >= 0) {
      documents.splice(index, 1);
      await queuePersist();
    }
  }

  toObject() {
    const result = {};
    for (const [key, value] of Object.entries(this)) {
      if (key !== "_model") result[key] = value;
    }
    return structuredClone(result);
  }
}

class LocalQuery {
  constructor(model, filter, single = false) {
    this.model = model;
    this.filter = filter;
    this.single = single;
    this.limitValue = Infinity;
    this.sortValue = null;
  }

  select() {
    return this;
  }

  sort(value) {
    this.sortValue = value;
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  lean() {
    this.leanResult = true;
    return this;
  }

  async execute() {
    let found = collections[this.model.collection].filter((document) => matches(document, this.filter));
    if (this.sortValue) {
      const [[field, direction]] = Object.entries(this.sortValue);
      found = found.slice().sort((left, right) => {
        const a = comparable(getValue(left, field));
        const b = comparable(getValue(right, field));
        return a < b ? -direction : a > b ? direction : 0;
      });
    }
    found = found.slice(0, this.single ? 1 : this.limitValue);
    if (this.single) {
      const document = found[0];
      return document ? (this.leanResult ? structuredClone(document) : createDocument(this.model, document)) : null;
    }
    return found.map((document) => this.leanResult ? structuredClone(document) : createDocument(this.model, document));
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

class LocalModel {
  constructor(collection, defaults = {}, uniqueFields = []) {
    this.collection = collection;
    this.defaults = defaults;
    this.uniqueFields = uniqueFields;
  }

  async checkUnique(document, exceptId) {
    for (const field of this.uniqueFields) {
      const value = getValue(document, field);
      const duplicate = collections[this.collection].find((item) =>
        item._id !== exceptId &&
        (field === "email" ? String(getValue(item, field)).toLowerCase() === String(value).toLowerCase() : getValue(item, field) === value)
      );
      if (duplicate) {
        const error = new Error(`Duplicate value for ${field}.`);
        error.code = 11000;
        throw error;
      }
    }
  }

  async create(source) {
    const now = new Date().toISOString();
    const document = {
      ...structuredClone(this.defaults),
      ...structuredClone(source),
      _id: source._id || crypto.randomUUID(),
      createdAt: source.createdAt || now,
      updatedAt: now,
    };
    await this.checkUnique(document);
    collections[this.collection].push(document);
    await queuePersist();
    return createDocument(this, document);
  }

  find(filter = {}) {
    return new LocalQuery(this, filter);
  }

  findOne(filter = {}) {
    return new LocalQuery(this, filter, true);
  }

  findById(id) {
    return this.findOne({ _id: String(id) });
  }

  async exists(filter = {}) {
    return collections[this.collection].some((document) => matches(document, filter)) ? { _id: "exists" } : null;
  }

  async countDocuments(filter = {}) {
    return collections[this.collection].filter((document) => matches(document, filter)).length;
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const index = collections[this.collection].findIndex((item) => matches(item, filter));
    const document = collections[this.collection][index];
    if (!document) return null;
    const updated = structuredClone(document);
    applyUpdate(updated, update);
    updated.updatedAt = new Date().toISOString();
    await this.checkUnique(updated, updated._id);
    collections[this.collection][index] = updated;
    await queuePersist();
    return createDocument(this, updated);
  }

  async updateOne(filter, update, options = {}) {
    const document = collections[this.collection].find((item) => matches(item, filter));
    if (document) {
      applyUpdate(document, update);
      document.updatedAt = new Date().toISOString();
      await queuePersist();
      return { matchedCount: 1, modifiedCount: 1 };
    }
    if (options.upsert) {
      const inserted = { _id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      applyUpdate(inserted, update, true);
      collections[this.collection].push(inserted);
      await queuePersist();
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }

  async updateMany(filter, update) {
    const found = collections[this.collection].filter((item) => matches(item, filter));
    for (const document of found) {
      applyUpdate(document, update);
      document.updatedAt = new Date().toISOString();
    }
    if (found.length) await queuePersist();
    return { matchedCount: found.length, modifiedCount: found.length };
  }

  async bulkWrite(operations) {
    for (const operation of operations) {
      if (operation.updateOne) {
        await this.updateOne(operation.updateOne.filter, operation.updateOne.update, operation.updateOne);
      }
    }
  }

  static isValidObjectId(id) {
    return /^[0-9a-f]{24}$/i.test(String(id)) || /^[0-9a-f-]{36}$/i.test(String(id));
  }
}

async function initialize() {
  await fs.mkdir(path.dirname(databaseFile), { recursive: true });
  try {
    const saved = JSON.parse(await fs.readFile(databaseFile, "utf8"));
    for (const collection of Object.keys(collections)) {
      if (Array.isArray(saved[collection])) collections[collection] = saved[collection];
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await persist();
  }
}

module.exports = {
  LocalModel,
  initialize,
};
