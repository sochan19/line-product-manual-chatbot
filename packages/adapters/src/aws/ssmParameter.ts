import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const client = new SSMClient({});

export async function getSsmParameter(parameterName: string): Promise<string> {
  const result = await client.send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
  );
  const value = result.Parameter?.Value;
  if (!value) {
    throw new Error(`SSMパラメータが見つかりません: ${parameterName}`);
  }
  return value;
}
