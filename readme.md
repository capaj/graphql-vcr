# graphql-vcr

## Usage with koa

```javascript
import graphqlVcr from 'graphql-vcr'
const vcr = graphqlVcr({
  schema,
  enable: true /* put false to disable recording without having to remove any code*/
})

graphQLRouter.post('/graphql', koaBody(), (context, next) => {
  const reqRec = vcr.recordRequest()
  reqRec.query(context.req.body)
  return graphqlKoa({
    schema,
    context: context.req.session
  })(context, next).then(() => {
    reqRec.result(context.response.body)
  })
})

// then to replay:
vcr.play('./vcr-sessions/2018-04-30T00:24:24.317Z.json')
// then to replay and check:
vcr.playAndCheck('./vcr-sessions/2018-04-30T00:24:24.317Z.json')
```
