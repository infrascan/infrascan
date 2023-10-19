# @infrascan/aws

A convenience package to register all AWS scanners with an instance of the Infrascan SDK.

### Usage

```js
import registerAwsScanners from "@infrascan/aws";
import Infrascan from "@infrascan/sdk";

const infrascanClient = new Infrascan();
registerAwsScanners(infrascanClient);
```