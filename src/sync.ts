import { FileSystemAdapter, Notice } from "obsidian";
import { join } from 'path'
import { existsSync } from 'fs'
import axios from 'axios';
import { MixaSettings } from "types";
import { S3Client } from "@aws-sdk/client-s3";
import S3SyncClient from 's3-sync-client';

const API_BASE = 'https://app.mixa.site/api'
const BUCKET_NAME = 'resource.mixa.site'

const client = axios.create({
    baseURL: API_BASE,
});

function getBasePath() {
    const adapter = app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
        return adapter.getBasePath();
    }
    new Notice('Your system does not support files access');
    throw Error('Your system does not support files access')
}

export async function getSiteData(secretToken: string) {
    if (!secretToken) return
    const { data } = await client.get(`/site/token/${secretToken}/info`)
    return data
}
export async function syncData(settings: MixaSettings) {
    const rootFolder = join(getBasePath(), settings.siteFolder)

    if (!existsSync(rootFolder)) {
        throw Error(`Site folder you specified does not exist: ${settings.siteFolder}`)
    }

    const { data: creds } = await client.get(`/site/token/${settings.secretToken}/auth`)
    if (!creds || !Object.keys(creds).length) {
        throw Error(`Could not upload the files due to an unknown error, please contact support@mixa.site`)
    }

    const s3Path = `s3://${BUCKET_NAME}/${settings.subdomain}`
    try {
        await syncToS3(creds, rootFolder, s3Path)
        await client.post(`/site/token/${settings.secretToken}/build`)
    } catch(err) {
        console.error(err)
        throw err
    }
}

function syncToS3(creds: any, localFolder: string, s3Path: string) {
    const s3Client = new S3Client({
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: creds,
        endpoint: `https://s3.us-east-1.amazonaws.com`,
    });
    const { sync } = new S3SyncClient({ client: s3Client });

    console.log(`syncing files to s3. local: ${localFolder}, remote: ${s3Path}`);
    return sync(localFolder, s3Path, {
        del: true,
        filters: [
            {
                exclude: (key: string) => key.split('/').some(n => n.startsWith('.'))
            }
        ],
    })
}