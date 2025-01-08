This repository provides two key features for working with models: Multi-Language Support and Model Merging. These tools streamline the process of localizing and consolidating model data for use in various applications.
Features
## Multi-Language Support

Translate model-facing information, such as titles, labels, descriptions, and units, into specified languages. This feature uses Google Cloud's Translation service to ensure accurate translations.

Setup:

- Set up Google Cloud Translation Service by following the official [guide](https://cloud.google.com/translate/docs/setup).
- Add the following script to your package.json:
  
  ```
  "scripts": {
    "dictionaries": "pack-models -d ./models -l fr,es,zh -m bnp"
  }
  ```
  
  where:
  
    -d: Directory containing the models.  
    -l: List of languages to translate into (default: English if unspecified).  
    -m: Domain name (default: the name of the configuration directory).  

## Model Merging - used only to translate common models

Combines all JSON model files from the specified directory into a single merge.js file. This simplifies managing and deploying models.
Setup:

Add the following script to your package.json:
```
"scripts": {
  ...
  "merge": "pack-models -i ./models -o ./models.js"
}
```
where:

  -i: Input directory containing the JSON model files.  
  -o: Output file where the merged models will be saved.  

For an example of the output checkout [models.js](https://github.com/tradle/models/blob/master/models.js).
