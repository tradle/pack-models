const path = require('path')
const pify = require('pify')
const fs = pify(require('fs'))
const findit = require('findit')
const dotProp = require('dot-prop')
const VALUE_FILENAME_REGEX = /^([^/]+)\/(.*?)\.[^.]+$/

module.exports = { split, merge, embedValues }

function split (models, dir) {
  dir = path.resolve(dir)
  return Promise.all(
    models.map((m) => {
    const fname = toFilePath(dir, m.id)
    return fs.writeFile(path.resolve(fname), prettify(m))
    })
  )
}

function embedValues (modelsDir, valuesDir) {
  valuesDir = path.resolve(valuesDir)
  const finder = findit(valuesDir)
  const edits = {}
  const promises = []
  finder.on('file', (file) => {
    const relativePath = file.slice(valuesDir.length + path.sep.length)
    const parsed = parseValueFileName(relativePath)
    if (!parsed) return

    const { modelId, propPath } = parsed
    const modelFile = path.join(modelsDir, `${modelId}.json`)
    const model = edits[modelFile] || require(path.resolve(modelFile))
    edits[modelFile] = model

    const setValue = fs.readFile(file, { encoding: 'utf8' }).then((value) => {
      dotProp.set(model, propPath, value)
    })

    promises.push(setValue)
  })

  return new Promise((resolve, reject) => {
    finder.once('end', () => {
      Promise.all(promises)
        .then(() => {
          return Object.keys(edits).map((file) => {
            return fs.writeFile(file, prettify(edits[file]))
          })
        })
        .then(resolve, reject)
    })
  })
}

function merge (modelsDir, outFilePath) {
  if (typeof outFilePath === 'undefined') {
    outFilePath = modelsDir
    modelsDir = null
  }

  outFilePath = path.resolve(outFilePath)
  modelsDir = path.resolve(modelsDir)
  const outDir = path.dirname(outFilePath)
  return fs.readdir(path.resolve(modelsDir)).then((files) => {
    files = files.filter((file) => (/\.json$/).test(file))

    const models = files.map(file => {
      const model = require(path.join(modelsDir, file))
      return {
        id: model.id,
        relPath: path.relative(outDir, path.join(modelsDir, file))
      }
    })

    const contents = genModelsFile(models)
      return fs.writeFile(outFilePath, contents)
    })
}

function toFilePath (dir, id) {
  return path.join(dir, `${id}.json`)
}

function parseValueFileName (file) {
  const result = VALUE_FILENAME_REGEX.exec(file)
  if (!result) return null

  const [modelId, propPath] = result.slice(1)
  return {
    modelId,
    propPath
  }
}

function prettify (obj) {
  return JSON.stringify(obj, null, 2)
}

function genModelsFile (models) {
  const getters = models.map(
    ({ id, relPath }) => `  get '${id}' () { return require('./${relPath}') }`
  )

  return `/* eslint-disable brace-style */
const models = {
${getters.join(',\n')}
}
module.exports = models
`
}
