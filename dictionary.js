const Promise = require('bluebird')
const path = require('path')
const pify = require('pify')
const fs = pify(require('fs'))
const _ = require('lodash')
const writeFileAtomic = require('write-file-atomic')
const stableStringify = require('json-stable-stringify')
const Translate = require('@google-cloud/translate')

const MODEL = 'model'
const PROPERTY_NAME = 'propertyName'
const DEFAULT = 'Default'

module.exports = { writeDictionary, writeDictionaries }

const translate = new Translate();

const translateModel = async ({ model, dictionary, lang, currentIds }) => {
  const m = model
  const { id } = m

  if (!m  ||  !m.title || !id)
    debugger
  let mid = ['model', id, m.title].join('_')
  let newIds = {[mid]: true}
  let hasChanged
  if (!currentIds[mid]) {
    hasChanged = true
    await addToDictionary({ dictionary, model, title: m.title, lang })
  }
  let props = m.properties
  for (let p in props) {
    if (p.charAt(0) === '_')
      continue

    let title = props[p].title
    let pid, hasOwnTitle
    if (title) {
      pid = [id, p, title].join('_')
      hasOwnTitle = true
    }
    else {
      title = makeLabel(p)
      pid = [DEFAULT, p, title].join('_')
    }
    newIds[pid] = true
    if (!currentIds[pid]) {
      await addToDictionary({dictionary, model: hasOwnTitle && model, propertyName: p, title, lang})
      currentIds[pid] = true
      hasChanged = true
    }
  }
  return { changed: hasChanged, newIds }
}
async function addToDictionary({dictionary, model, propertyName, title, lang}) {
  let obj = {
    [lang]: await translateText(title, lang),
    en: title,
    name: propertyName || model.id,
    type: propertyName && PROPERTY_NAME || MODEL,
  }
  if (propertyName)
    obj.model = model  &&  model.id || DEFAULT
  dictionary.push(obj)
}
async function writeDictionaries(modelsDir, lang) {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('Please set environment variable GOOGLE_APPLICATION_CREDENTIALS to allow models translation')
    return
  }
  let langs = lang.split(',')
  await Promise.all(langs.map(lang => writeDictionary(modelsDir, lang)))
}
async function writeDictionary(modelsDir, lang) {
  let fn = './dictionary_' + lang + '.json'
  let dfile
  let currentIds = {}
  try {
    dfile = require(fn)
    dfile.forEach(({ type, model, name, en }) => {
      let id
      if (type === MODEL)
        id = [type,name,en].join('_')
      else
        id = [model, name, en].join('_')
      currentIds[id] = true
    })
  } catch (err) {
    console.log(err.message)
    dfile = []
  }

  // let appDictionary = await genDictionaryForApp(lang)

  modelsDir = path.resolve(modelsDir)

  let files = await fs.readdir(path.resolve(modelsDir))
  files = files.filter(file => /\.json$/.test(file))

  const models = files.map(file => {
    return require(path.join(modelsDir, file))
  })

  let keys = Object.keys(models)
  let result = await Promise.all(keys.map(id => translateModel({
    model: models[id],
    // propNames,
    lang,
    dictionary: dfile,
    currentIds
  })), { concurrency: 20 })

  // Check if some models/props were deleted
  let hasChanged
  let newIds = {}
  result.forEach(r => {
    _.extend(newIds, r.newIds)
    if (r.changed)
      hasChanged = true
  })
  for (let p in currentIds) {
    if (!newIds[p]) {
      let parts = p.split('_')
      let filter, idx
      if (parts[0] === MODEL)
        filter = {type: MODEL, name: parts[1], en: parts[2]}
      else
        filter = {model: parts[0], name: parts[1], en: parts[2]}
      idx = _.findIndex(dfile, filter)
      let rm = dfile.splice(idx, 1)
      hasChanged = true
    }
  }
  if (hasChanged)
    writeFileAtomic(fn, JSON.stringify(dfile, 0, 2), console.log)
}
async function translateText(text, lang) {
  if (lang === 'en')
    return text
  // return text
  const results = await translate.translate(text, lang)
  const translations = results[0];
  return Array.isArray(translations) ? translations[0] : translations
}

function makeLabel(label) {
  return label
        // insert a space before all caps
        .replace(/([A-Z])/g, ' $1')
        // uppercase the first character
        .replace(/^./, str => str.toUpperCase())
}

// function printUsage () {
//   console.log(function () {
//   `
//   Usage:
//   Options:
//       -h, --help              print usage
//       -f, --file              file path where the model resides
//       -m, --model             model json object. Verifies everyhing except references
//       -r, --references        the array of models for which to check the references
//   `
//   }.toString()
//   .split(/\n/)
//   .slice(2, -2)
//   .join('\n'))

//   process.exit(0)
// }
// async function genDictionaryForApp(lang) {
//   let fn = './dictionary_' + lang + '.json'
//   let dfile
//   try {
//     dfile = require(fn)
//   } catch (err) {
//     console("there is not file: ", err)
//     return
//   }
//   let groups = _.groupBy(dfile, 'type')
//   let models = groups[MODEL]
//   let properties = groups[PROPERTY_NAME]
//   let dmodels = {}
//   models.forEach(m => dmodels[m.name] = m[lang])
//   let dprops = {}
//   properties.forEach(p => {
//     if (!dprops[p.name])
//       dprops[p.name] = {}
//     dprops[p.name][p.model] = p[lang]
//   })
//   let dictionary = {
//     models: dmodels,
//     properties: dprops
//   }
//   let outputFn = './dictionaryApp_' + lang + '.json'
//   writeFileAtomic(outputFn, stableStringify(dictionary, { space: '  ' }), console.log)
// }
