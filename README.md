This repository provides two key features for working with models: Multi-Language Support and Model Merging (model merging only used for tradle models). These tools streamline the process of localizing and consolidating model data for use in various applications.  

## Multi-Language Support

Translate model-facing information, such as titles, labels, descriptions, and units, into specified languages. This feature uses Google Cloud's Translation service to ensure accurate translations.

Setup:
1. Set up Google Cloud Translation Service. Set Up Service Account and then Set up Authentication. 
   - Go to the [Google Cloud Console](https://cloud.google.com/translate/docs/setup).
   - Navigate in the menu to IAM & Admin → Service Accounts.
   - Create a new service account:
      Click Create Service Account.
      Provide a name and description for the service account.
      Click Create and Continue.

   - Google Cloud APIs require authentication using a service account key file. To generate a key file:
      Go to the service account's details.
      Click Keys → Add Key → Create New Key.
      Choose JSON and download the key file. Save it securely.
2. Install this package in your configuration directory by running the following command:
  ```
  npm i -S @tradle/pack-models
  ```
       
3. Add the script to your package.json in your configuration directory that can look like this:  
  ```
  "scripts": {
    ...
    "translations": "pack-models -d ./models -l fr,es,zh -m bnp",
  }
  ```
OR you can run it from command line in the root of your configuration directory:
```
  AWS_PROFILE=[aws_profile] node ./node_modules/@tradle/pack-models/bin/pack-models -d ./models -l fr,es,zh -m bnp
```  
  where:
  
    -d: Directory containing the models.  
    -l: List of languages to translate into (default: English if unspecified).  
    -m: Domain name (default: the name of the configuration directory).  

The translation process generates a file named dictionary_[language].json, where [language] corresponds to the target language code (e.g., dictionary_fr.json for French).

The resulting file will be stored in the S3.
