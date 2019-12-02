/**
 * This Lambda distributes the S3 Bucket from one of AWS's global regions to one of China's regions.
 *
 * The Lambda is triggered by events related to source S3 Bucket changes.
 */
const CN_REGION = process.env.CN_REGION;
const CN_S3_BUCKET = process.env.CN_S3_BUCKET;
const SSM_CN_CREDENTIALS = process.env.SSM_CN_CREDENTIALS;

const SSM_DELIMITER_INDEX = SSM_CN_CREDENTIALS.indexOf(':');
const CN_ACCESS_KEY_ID = SSM_CN_CREDENTIALS.substring(0, SSM_DELIMITER_INDEX);
const CN_SECRET_ACCESS_KEY = SSM_CN_CREDENTIALS.substring(SSM_DELIMITER_INDEX + 1);

const AWS = require('aws-sdk');
const S3_GL = new AWS.S3();
const S3_CN = new AWS.S3({ region: CN_REGION, accessKeyId: CN_ACCESS_KEY_ID, secretAccessKey: CN_SECRET_ACCESS_KEY});

const MAX_ATTEMPTS = 5;

exports.lambda_handler = lambda_handler;

async function lambda_handler(event) {
    let input = event.Records[0];
    let snsMessage = JSON.parse(input.Sns.Message);
    let record = snsMessage.Records[0];
    let eventName = record.eventName;
    let bucketName = record.s3.bucket.name;
    let key = decodeURIComponent(record.s3.object.key);

    console.log(`Processing ${bucketName}/${key} `);
    if (eventName.startsWith('ObjectRemoved')){
        return deleteObject(key);
    } else {
        return copyObject(bucketName, key);
    }
}

async function copyObject(bucketName, key) {
    let params = {
        Bucket: bucketName,
        Key: key,
    };
    return await Promise.all([
        S3_GL.headObject(params).promise(),
        S3_GL.getObjectTagging(params).promise()
    ]).then(async function(res) {
        let head = res[0];
        let tags = res[1].TagSet;
        let attempt = 1;
        do {
            try {
                let stream = S3_GL.getObject(params).createReadStream();
                stream.on('error', function (err) {
                    throw responseError(err);
                });
                let paramsCn = {
                    Bucket: CN_S3_BUCKET,
                    Key: key,
                    Body: stream,
                    ContentLength: head.ContentLength,
                    ContentType: head.ContentType,
                    Metadata: head.Metadata,
                    Tagging: tags.map(tag => encodeURIComponent(tag.Key) + '=' + encodeURIComponent(tag.Value)).join('&')
                };
                res = await putObject(paramsCn, head.Etag);
            } catch (e) {
                res = {passed: false, error: e};
                if(attempt < MAX_ATTEMPTS) {
                    console.log('error', e,' was thrown during ', attempt, ' attempt.');
                    await justWait(attempt * 3 * 1000);
                } else {
                    console.log(`Could not copy object in ${attempt} attempts. Finishing operation with error.`);
                }
                attempt++;
            }
        } while (!res.passed && attempt <= MAX_ATTEMPTS);
        if(!res.passed) throw res.error;
        return res;
    }).catch(error => responseError(error, key));
}

async function putObject(params, etag) {
    return S3_CN.putObject(params).promise().then(res => {
        if (etag === res.Etag) return {passed: true};
        throw "Etag of replication has changed!";
    });
}

async function justWait(time) {
    return new Promise(function(fulfill) {
        setTimeout(fulfill, time);
    });
}

function deleteObject(key) {
    let params = {
        Bucket: CN_S3_BUCKET,
        Key: key,
    };
    return S3_CN.deleteObject(params).promise().catch(error => responseError(error, params.Key));
}

function responseError(error, key) {
    console.error("ERROR:", error, key);
    throw JSON.stringify({
        statusCode: error.code,
        key: key,
        body: error
    });
}
