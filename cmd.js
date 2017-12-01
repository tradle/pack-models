#!/usr/bin/env node

const path = require('path')
const { merge, embedValues } = require('./index')
const HELP = `
  Usage:

  build-models --input ./models --output ./models.js --values ./values

  Options:
  --input, -i   path/to/models directory
  --output, -o  path/to/models.js output file
  --array, -a   export array of models instead of id->model map
  --values, -i  path/to/values directory (values to embed in models)
  --help, -h    see this menu again
`

const cwd = process.cwd()
const argv = require('minimist')(process.argv.slice(2), {
  alias: {
    i: 'input',
    o: 'output',
    v: 'values',
    h: 'help'
  },
  // default: {
  //   input: path.join(cwd, 'models'),
  //   output: path.join(cwd, 'models.js'),
  //   values: path.join(cwd, 'values')
  // }
})

const { input, output, values, help, array } = argv
if (help) {
  console.log(HELP)
  process.exit(0)
}

if (input && values) {
  console.log('embedding values')
  embedValues(input, values)
}

if (input && output) {
  console.log('merging models')
  merge(input, output, array)
}
