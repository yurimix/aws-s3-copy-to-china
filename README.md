# aws-s3-copy-to-china
Copy AWS S3 objects from one of AWS Global region to one of China regions

# Intro
As you probably know, AWS China uses a particular partition in AWS ARN: `aws-cn` ([see here](https://docs.amazonaws.cn/en_us/general/latest/gr/aws-arns-and-namespaces.html)).
It means you cannot use standard S3 replication from AWS Global to AWS China because
you cannot provide access to account which has unsupported ARN specification.

Is there really nothing to be done in this case? Of course, not. This project illustrates how to avoid such limitations using AWS Lambda.

This code is not perfect, it has some limitations, in particular when copying large S3 objects (more than 5G).
Please consider the code as a sample, which can be adapted for your final decision.

# Lambda
It is assumed that Lambda will be deployed in AWS Global region because AWS China does not support
Lambda parameters (Dec, 2019. Why?..).

So, Lambda has the following configuration:
* CN_REGION - name of one of region in China (cn-north-1, cn-northwest-1)
* CN_S3_BUCKET - name of S3 bucket (must be already exist) in China region
* SSM_CN_CREDENTIALS - name of SSM parameter in the same AWS Global region which contains credentials to access to AWS account in China.
This parameter contains comma-separated string `ACCESS_KEY_ID:SECRET_ACCESS_KEY`. 

Note: using SSM to store sensitive data is one of techniques which can be used to avoid publishing somewhere excluding Amazon.

# Events
This Lambda is subscribed to SNS events, but can be easily modified to use direct S3 bucket events.



