# AWS Scanner Codegen

This is the internal codegen module for generating the AWS Scanners from their config files.

The codegen module is passed the scanner config as an object, and outputs all of the required code under the `generated` folder. The suggested definition for the Scanner's `index.ts` is then printed to the console. This is to account for cases where custom logic is added to the scanner, and must be included. In basic cases, the suggested `index.ts` will be correct.
