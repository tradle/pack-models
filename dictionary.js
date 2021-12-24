/* eslint-disable no-process-env */
/* eslint-disable no-extra-parens */
const Promise = require('bluebird')
const path = require('path')
const pify = require('pify')
const fs = pify(require('fs'))
const _ = require('lodash')
const Translate = require('@google-cloud/translate')
const aws = require('aws-sdk')
const s3ls = require('s3-ls')

const MODEL = 'model'
const PROPERTY_NAME = 'propertyName'
const DEFAULT = 'Default'
const MAX_LANGUAGES_IN_ONE_SHOT = 1
const BUCKET = 'tradle.io'
const DICTIONARIES_FOLDER = 'dictionaries/'

module.exports = { writeDictionary, writeDictionaries }

const translate = new Translate();
const s3 = new aws.S3()
aws.config.setPromisesDependency(Promise);

async function writeDictionaries ({
  // eslint-disable-next-line no-inline-comments
  modelsDir, lang, newOnly /* Memo:, all */, domain
}) {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(
      'Please set environment variable GOOGLE_APPLICATION_CREDENTIALS ' +
      ' to allow models translation'
    )
    return
  }
  if (!process.env.AWS_PROFILE) {
    console.log('Please check if you use the correct AWS_PROFILE')
    return
  }
  let langs
  // Memo: if (lang && lang !== 'en')
  if (lang)
    langs = lang.split(',')
  else {
    const [languages] = await translate.getLanguages()
    langs = languages.map(l => l.code)
  }

  modelsDir = path.resolve(modelsDir)
  let models
  const parts = modelsDir.split('/')
  const dir = parts[parts.length - 2]
  if (modelsDir.indexOf('.json') === -1) {
    let files = await fs.readdir(modelsDir)
    files = files.filter(file => (/\.json$/).test(file))

    models = files.map(file => {
      return require(path.join(modelsDir, file))
    })
  } else {
    const ddir = path.resolve(dir)
    if (!fs.existsSync(ddir))
      fs.mkdirSync(ddir)
    models = require(modelsDir)
  }
  let len
  if (langs.length > MAX_LANGUAGES_IN_ONE_SHOT)
    len = MAX_LANGUAGES_IN_ONE_SHOT
  else
    len = langs.length

  const s3Dir = (domain && domain.split('.')[0]) || dir
  const lister = s3ls({bucket: BUCKET});
  const folder = `${DICTIONARIES_FOLDER}${s3Dir}/`
  let fileNames
  try {
    const data = await lister.ls(folder)
    fileNames = data.files
  } catch (err) {
    console.log(err.message, err.stack)
    return
  }

  let i = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const newLangs = []
    for (let j = 0; j < len && i < langs.length; i += 1, j += 1) {
      const l = langs[i]
      const fn = `${folder}dictionary_${l}.json`
      if (newOnly && fileNames.includes(fn))
        continue

      newLangs.push(l)
    }
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(newLangs
      .map(newLang => writeDictionary({models, newLang, newOnly, dir: s3Dir}))
    )
    if (i === langs.length)
      break
    // eslint-disable-next-line no-await-in-loop
    await timeout(60000)
  }
}
function timeout (ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function writeDictionary ({models, lang, newOnly, dir}) {
  let fn = `/dictionary_${lang.replace('-', '')}.json`
  if (dir)
    fn = `${dir}${fn}`
  else
    fn = `.${fn}`
  let dfile
  const paramsGet = {
    Bucket: BUCKET,
    Key: `${DICTIONARIES_FOLDER}${fn}`
   };
  try {
    const res = await s3.getObject(paramsGet).promise()
    dfile = JSON.parse(Buffer.from(res.Body).toString('utf8'))
    if (dfile && newOnly)
      return
    if (!dfile)
      dfile = []
  } catch (err) {
    console.log(err.message)
    if (err.statusCode !== 404)
      return

    if (!newOnly)
      newOnly = true
    dfile = []
  }

  const currentIds = {}
  // eslint-disable-next-line no-inline-comments
  dfile.forEach(({ type, model, name, en /* Passed in: , description */ }) => {
    const id = (type === MODEL)
      ? [type, name, en].join('_')
      : [model, name, en].join('_')
    // Memo: if (description)
    // Memo:   id += `_${description}`
    currentIds[id] = true
  })

  console.log(`Translating to ${lang}`)
  const keys = Object.keys(models)
  const result = await Promise.all(keys.map(id => translateModel({
    model: models[id],
    lang,
    dictionary: dfile,
    currentIds
  })), { concurrency: 20 })

  // Check if some models/props were deleted
  let hasChanged
  const newIds = {}
  result.forEach(r => {
    _.extend(newIds, r.newIds)
    if (r.changed)
      hasChanged = true
  })
  for (const p in currentIds) {
    if (newIds[p])
      continue
    hasChanged = true
  }
  if (!hasChanged && !newOnly)
    return
  dfile.sort((a, b) => {
    return a.en > b.en
  })

  const paramsPut = {
    Body: Buffer.from(JSON.stringify(dfile, 0, 2)),
    Bucket: BUCKET,
    Key: `${DICTIONARIES_FOLDER}${fn}`,
    ACL: 'public-read'
  }
  s3.putObject(paramsPut, (err, data) => {
    if (err) {
      // An error occurred
      console.log(err, err.stack);
    } else {
      // Successful response
      console.log(data);
    }
  })
}

const translateModel = async ({ model, dictionary, lang, currentIds }) => {
  const m = model
  const { id } = m

  // Memo: if (!m || !m.title || !id) {
  // Memo:   debugger
  // Memo: }
  const mid = ['model', id, m.title].join('_')

  const newIds = {[mid]: true}

  let hasChanged
  if (!currentIds[mid]) {
    hasChanged = true
    const obj = await addToDictionary({
      dictionary, model, title: m.title, lang
    })
    if (m.enum) {
      obj.enum = {}
      // eslint-disable-next-line no-inline-comments
      m.enum.forEach(async ({ /* Also available: id, */ title}) => {
        obj.enum[id] = await translateText(title, lang)
      })
    }
  } else if (m.enum) {
    const idx = dictionary.findIndex(r => r.type === 'model' && r.name === m.id)
    const obj = dictionary[idx]
    if (obj.enum.length !== m.enum.length) {
      hasChanged = true
      for (let i=0; i<m.enum.length; i += 1) {
        const { id: mEId, mETitle } = m.enum[i]
        if (!obj.enum[mEId])
          // eslint-disable-next-line no-await-in-loop
          obj.enum[mEId] = await translateText(mETitle, lang)
      }
    }
  }
  const props = m.properties
  for (const p in props) {
    if (p.charAt(0) === '_')
      continue

    let { title } = props[p]
    const { description, units } = props[p]
    let pid
    let notDefault = false
    if (title) {
      pid = [id, p, title].join('_')
      notDefault = true
      // Memo: if (description)
      // Memo:   pid += `_${description}`
    } else {
      title = makeLabel(p)
      pid = [(description && id) || DEFAULT, p, title].join('_')
      if (description) {
        notDefault = true
        // Memo: pid += `_${description}`
      }
    }
    newIds[pid] = true
    if (!currentIds[pid]) {
      currentIds[pid] = true
      hasChanged = true
      // eslint-disable-next-line no-await-in-loop
      await addToDictionary({
        dictionary, model: notDefault && model,
        propertyName: p, description, units, title, lang
      })
    }
  }
  return { changed: hasChanged, newIds }
}

async function addToDictionary ({
  dictionary, model, propertyName, title, description, units, lang
}) {
  const obj = {
    [lang]: await translateText(title, lang),
    en: title,
    name: propertyName || model.id,
    type: (propertyName && PROPERTY_NAME) || MODEL
  }
  if (propertyName)
    obj.model = (model && model.id) || DEFAULT
  if (description)
    obj.description = await translateText(description, lang)
  if (units)
    obj.units = await translateText(units, lang)
  dictionary.push(obj)
  return obj
}
async function translateText (text, lang) {
  if (lang === 'en') return text
  const results = await translate.translate(text, lang)
  let [translations] = results
  translations = translations.charAt(0).toUpperCase() + translations.slice(1)
  return Array.isArray(translations) ? translations[0] : translations
}

function makeLabel (label) {
  return label
    // Insert a space before all caps
    .replace(/([A-Z])/g, ' $1')
    // Uppercase the first character
    .replace(/^./, str => str.toUpperCase())
}
