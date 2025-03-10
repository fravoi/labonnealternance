"use strict"

import { RequestParams } from "@elastic/elasticsearch"
import type { Document } from "mongoose"
import { oleoduc, writeData } from "oleoduc"

import { logger } from "@/common/logger"
import { sentryCaptureException } from "@/common/utils/sentryUtils"

import { getElasticInstance } from ".."
import { logMessage } from "../../utils/logMessage"

import serialize from "./serialize"

// https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/bulk_examples.html

let isMappingNeedingGeoPoint = false
const exclude = ["id", "__v", "_id"]

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getProperties(type, instance = null, requireAsciiFolding = false) {
  // paramètre optionnel indiquant que la recherche sur le champ est insensible à la casse et aux accents
  const asciiFoldingParameters = requireAsciiFolding
    ? {
        analyzer: "folding",
        search_analyzer: "folding",
      }
    : {}

  if (type === "ObjectID" || type === "String")
    return {
      type: "text",
      fields: { keyword: { type: "keyword", ignore_above: 256 } },
      ...asciiFoldingParameters,
    }

  if (type === "Date") return { type: "date" }
  if (type === "Number") return { type: "long" }
  if (type === "Boolean") return { type: "boolean" }
  if (type === "Mixed") return { type: "nested" }

  if (type === "Array") {
    if (instance === "String") {
      return {
        type: "text",
        fields: { keyword: { type: "keyword", ignore_above: 256 } },
        ...asciiFoldingParameters,
      }
    }

    if (instance === "Mixed") {
      return { type: "nested" }
    }

    if (instance === "Boolean") {
      return { type: "boolean" }
    }

    if (instance === "Date") {
      return { type: "date" }
    }
  }
}

function getMapping(schema, requireAsciiFolding = false) {
  const properties = {}

  for (let i = 0; i < Object.keys(schema.paths).length; i++) {
    const key = Object.keys(schema.paths)[i]

    if (exclude.includes(key)) {
      continue
    }
    const mongooseType = schema.paths[key].instance
    const isSubDocument = typeof schema.paths[key].caster === "function"

    if (schema.paths[key].options.es_mapping) {
      properties[key] = schema.paths[key].options.es_mapping
      continue
    }

    if (/geo_/.test(key)) {
      properties[key] = { type: "geo_point" }
      isMappingNeedingGeoPoint = true
    } else {
      if (isSubDocument) {
        properties[key] = { type: "nested", properties: {} }
        for (let i = 0; i < Object.keys(schema.paths[key].caster.schema.paths).length; i++) {
          const subDocumentKey = Object.keys(schema.paths[key].caster.schema.paths)[i]
          const { instance, caster } = schema.paths[key].caster.schema.paths[subDocumentKey]

          properties[key].properties[subDocumentKey] = getProperties(instance, caster?.instance, requireAsciiFolding)
        }
      } else {
        properties[key] = getProperties(mongooseType, schema.paths[key].caster?.instance, requireAsciiFolding)
      }
    }
  }

  return { properties }
}

/*
function getMapping(schema, requireAsciiFolding = false) {
  const properties = {};

  // paramètre optionnel indiquant que la recherche sur le champ est insensible à la casse et aux accents
  const asciiFoldingParameters = requireAsciiFolding
    ? {
        analyzer: "folding",
        search_analyzer: "folding",
      }
    : {};

  for (let i = 0; i < Object.keys(schema.paths).length; i++) {
    const key = Object.keys(schema.paths)[i];

    const exclude = ["id", "__v", "_id"];
    if (exclude.includes(key)) {
      continue;
    }
    const mongooseType = schema.paths[key].instance;

    if (schema.paths[key].options.es_mapping) {
      properties[key] = schema.paths[key].options.es_mapping;
      continue;
    }

    if (/geo_/.test(key)) {
      properties[key] = { type: "geo_point" };
      isMappingNeedingGeoPoint = true;
    } else {
      switch (mongooseType) {
        case "ObjectID":
        case "String": {
          properties[key] = {
            type: "text",
            fields: { keyword: { type: "keyword", ignore_above: 256 } },
            ...asciiFoldingParameters,
          };
          break;
        }
        case "Date":
          properties[key] = { type: "date" };
          break;
        case "Number":
          properties[key] = { type: "long" };
          break;
        case "Boolean":
          properties[key] = { type: "boolean" };
          break;

        case "Array":
          if (schema.paths[key].caster.instance === "String") {
            properties[key] = {
              type: "text",
              fields: { keyword: { type: "keyword", ignore_above: 256 } },
              ...asciiFoldingParameters,
            };
          }

          break;
        default:
          break;
      }
    }
  }

  return { properties };
}*/

function Mongoosastic(schema, options) {
  const esClient = getElasticInstance()

  const mapping = getMapping(schema)
  const indexName = options.index
  const typeName = "_doc"

  // ElasticSearch Client
  schema.statics.esClient = esClient

  schema.statics.createMapping = async function createMapping(requireAsciiFolding = false) {
    try {
      const exists = await esClient.indices.exists({ index: indexName })

      const includeTypeNameParameters = isMappingNeedingGeoPoint || requireAsciiFolding ? { include_type_name: true } : {}

      const asciiFoldingParameters = requireAsciiFolding
        ? {
            body: {
              settings: {
                analysis: {
                  analyzer: {
                    folding: {
                      tokenizer: "standard",
                      filter: ["lowercase", "asciifolding"],
                    },
                  },
                },
              },
            },
          }
        : {}

      if (!exists.body) {
        await esClient.indices.create({ index: indexName, ...includeTypeNameParameters, ...asciiFoldingParameters })
      }
      const completeMapping = {}
      completeMapping[typeName] = getMapping(schema, requireAsciiFolding)

      await esClient.indices.putMapping({
        index: indexName,
        type: typeName,
        body: completeMapping,
        ...includeTypeNameParameters,
      })
    } catch (e: any) {
      let errorMsg = e.message
      if (e.meta && e.meta.body) errorMsg = e.meta.body.error
      console.error("Error update mapping", errorMsg || e)
    }
  }

  async function schemaIndex(doc: Document, refresh = true) {
    const _opts: RequestParams.Index<Record<string, string>> = {
      index: indexName,
      type: typeName,
      refresh,
      body: serialize(doc, mapping),
      id: doc._id.toString(),
    }

    try {
      await esClient.index(_opts)
    } catch (e) {
      logger.error(e)
      sentryCaptureException(e)
    }
  }

  schema.methods.unIndex = async function schemaUnIndex() {
    const _opts: RequestParams.Delete = {
      index: indexName,
      type: typeName,
      refresh: true,
      id: this._id.toString(),
    }

    let tries = 3
    while (tries > 0) {
      try {
        await esClient.delete(_opts)
        tries = 0
      } catch (e) {
        console.error(e)
        sentryCaptureException(e)
        await timeout(500)
        --tries
      }
    }
  }

  schema.statics.synchronize = async function synchronize(_filter = {}, refresh = false) {
    let count = 0
    await oleoduc(
      this.find({}).cursor(),
      writeData(
        async (doc) => {
          await schemaIndex(doc, refresh)
          if (++count % 1000 === 0) {
            logMessage("info", `progress: ${count} indexed ${this.modelName}`)
          }
        },
        { parallel: 8 }
      )
    )
    logMessage("info", `end: ${count} indexed ${this.modelName}`)
  }

  schema.statics.unsynchronize = async function unsynchronize() {
    const exists = await esClient.indices.exists({ index: indexName })
    if (exists) {
      await esClient.indices.delete({ index: this.modelName })
    }
  }

  function postRemove(doc) {
    if (doc) {
      const _doc = new doc.constructor(doc)
      return _doc.unIndex()
    }
  }

  function postSave(doc) {
    if (doc) {
      const _doc = new doc.constructor(doc)
      return schemaIndex(_doc)
    }
  }

  /**
   * Use standard Mongoose Middleware hooks
   * to persist to Elasticsearch
   */
  function setUpMiddlewareHooks(inSchema) {
    inSchema.post("remove", postRemove)
    inSchema.post("findOneAndRemove", postRemove)

    inSchema.post("save", postSave)
    inSchema.post("findOneAndUpdate", postSave)

    inSchema.post("insertMany", async (docs) => {
      for (let i = 0; i < docs.length; i++) {
        await postSave(docs[i])
      }
    })
  }
  setUpMiddlewareHooks(schema)
}

export default Mongoosastic
