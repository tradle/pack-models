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
  if (currentIds[mid])
    return

  await addToDictionary({ dictionary, model, title: m.title, lang })
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
    if (!currentIds[pid]) {
      // if (hasOwnTitle) {
        // if (!propNames[p][id]) {
          await addToDictionary({dictionary, model: hasOwnTitle && model, propertyName: p, title, lang})
          currentIds[pid] = true
        // }
      // }

      continue
    }

    // if (m.properties[p].title)
    //   await addToDictionary({dictionary, model, propertyName: p, title: m.properties[p].title, lang})
    // else
    //   await addToDictionary({dictionary, propertyName: p, title: makeLabel(p), lang})
/*
    if (m.properties[p].type === 'array'  &&  m.properties[p].items.properties) {
      let props = m.properties[p].items.properties
      propNames[p].items = {}
      for (let pp in props) {
        let title = props[pp].title  ||  makeLabel(pp)
        if (props[pp].title)
          propNames[p].items[pp] = await translateText(props[pp].title, lang)
        else
          propNames[p].items[pp] = await translateText(makeLabel(pp), lang)
      }
    }
*/
  }
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
  for (let i=0; i<langs.length; i++)
    await writeDictionary(modelsDir, langs[i])
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
  await Promise.all(keys.map(id => translateModel({
    model: models[id],
    // propNames,
    lang,
    dictionary: dfile,
    currentIds
  })), { concurrency: 20 })

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
