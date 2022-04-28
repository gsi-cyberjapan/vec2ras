# vec2ras for AWS CDK


## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template


## How to use

### setup instance

```sh
export AWS_ACCESS_KEY_ID=your-key-id
export AWS_SECRET_ACCESS_KEY=your-access-key
export AWS_SESSION_TOKEN=your-access-token # if need
export CDK_DEFAULT_ACCOUNT=your-aws-account
export CDK_DEFAULT_REGION=your-aws-region
npm install -g aws-cdk
npm install
cdk bootstrap
cdk deploy
```