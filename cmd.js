#!/usr/bin/env node

const path = require('path')
const { merge, embedValues } = require('./index')
const { writeDictionaries } = require('./dictionary')
const HELP = `
  Usage:

  build-models --input ./models --output ./models.js --values ./values

  Options:
  --input, -i   path/to/models directory
  --output, -o  path/to/models.js output file
  --array, -a   export array of models instead of id->model map
  --values, -i  path/to/values directory (values to embed in models)
  --help, -h    see this menu again
  --dictionary, -d  path/to/models directory
  --languages,  -l comma separated languages like: es,fr,fil,nl
  --newOnly,    -n new languages only
`

const cwd = process.cwd()
const argv = require('minimist')(process.argv.slice(2), {
  alias: {
    i: 'input',
    o: 'output',
    v: 'values',
    h: 'help',
    d: 'dictionary',
    l: 'languages',
    n: 'newOnly'
  },
  // default: {
  //   input: path.join(cwd, 'models'),
  //   output: path.join(cwd, 'models.js'),
  //   values: path.join(cwd, 'values')
  // }
})

const { input, output, values, help, dictionary, languages, array, newOnly } = argv
if (help) {
  console.log(HELP)
  process.exit(0)
}
const tasks = []

if (dictionary) {
  console.log('generate dictionary: ' + dictionary)
  tasks.push(writeDictionaries(dictionary, languages || 'en', newOnly))
}
if (input && values) {
  console.log('embedding values')
  tasks.push(embedValues(input, values))
}

if (input && output) {
  console.log('merging models')
  tasks.push(merge(input, output, array))
}

Promise.all(tasks).catch(err => {
  console.error(err.stack)
  process.exitCode = 1
})
