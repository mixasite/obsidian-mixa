import { FileSystemAdapter, Notice, Vault } from "obsidian";
import axios from 'axios';
import { MixaSettings } from "types";
import { join } from 'path'
import { existsSync } from 'fs'
import { S3Client } from "@aws-sdk/client-s3";
import S3SyncClient from 's3-sync-client';

const API_BASE = 'https://app.mixa.site/api';
const BUCKET_NAME = 'resource.mixa.site';
const S3_URL = 'https://s3.us-east-1.amazonaws.com';
const S3_REGION = 'us-east-1';

const client = axios.create({
    baseURL: API_BASE,
});

function stripSlash(str: string) {
    return str?.replace(/^\/*|\/*$/g, "");
}

function getBasePath() {
    const adapter = app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
        return adapter.getBasePath();
    }
    new Notice('Your system does not support files access');
    throw Error('Your system does not support files access');
}

export async function getSiteData(secretToken: string) {
    if (!secretToken) return;
    const { data } = await client.get(`/site/token/${secretToken}/info`);
    return data;
}

export async function getAdditionalFiles(vault: Vault, siteFolder: string) {
    const sanitizeRegex = /\.*\/*(.*?)?( *\|.*)?$/g;
    const referenceRegex = /!?\[(?:\[|\]\()(.*?)(?:\]\]|\)|\|)/g;
    const matches = (await Promise.all(vault.getMarkdownFiles()
        .filter(f => f.path.startsWith(siteFolder))
        .map(f => vault.cachedRead(f))))
        .join()
        .matchAll(referenceRegex);
    const referencedFiles: string[] = [];
    for (const match of matches) {
        referencedFiles.push(match[1].replace(sanitizeRegex, '$1'));
    }

    // find actual paths of the referenced files
    // check if they're not part of the siteFolder
    const localFiles = vault.getFiles().map(f => f.path).map(f => f.replace(sanitizeRegex, '$1')).filter(f => !f.startsWith(siteFolder));
    // add them to sync
    const filesToCopy = localFiles.filter(lf => referencedFiles.some(rf => lf.endsWith(rf) || lf.endsWith(`${rf}.md`)));
    return filesToCopy;
}

export async function syncData(settings: MixaSettings, vault: Vault) {
    // should give a notice to the user here for mobile devices (without node envrionment) and exit
    const rootFolderAbsPath = getBasePath();
    const siteFolder = stripSlash(settings.siteFolder);
    const localFolder = join(rootFolderAbsPath, siteFolder);

    if (!existsSync(localFolder)) {
        throw Error(`Site folder you specified does not exist: ${settings.siteFolder}`);
    }

    let additionalFiles: string[] = [];
    if (settings.publishExternal) {
        try {
            additionalFiles = await getAdditionalFiles(vault, siteFolder);
        } catch (err) {
            console.error(err);
        }
    }

    const { data: creds } = await client.get(`/site/token/${settings.secretToken}/auth`);
    if (!creds || !Object.keys(creds).length) {
        throw Error(`Could not upload the files due to an unknown error, please contact support@mixa.site`);
    }

    const s3Path = `s3://${BUCKET_NAME}/${settings.subdomain}`;
    try {
        await syncToS3(creds, rootFolderAbsPath, siteFolder, s3Path, additionalFiles);
        await client.post(`/site/token/${settings.secretToken}/build`);
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function syncToS3(creds: any, rootFolderAbsPath: string, siteFolder: string, s3Path: string, additionalFiles: string[]) {
    const s3Client = new S3Client({
        region: S3_REGION,
        forcePathStyle: true,
        credentials: creds,
        endpoint: S3_URL,
    });
    const { sync } = new S3SyncClient({ client: s3Client });

    console.log(`syncing files to s3. local: ${siteFolder}, remote: ${s3Path}`);
    console.log(`additional files being sent ${additionalFiles}`);

    return await sync(rootFolderAbsPath, s3Path, {
        del: true,
        relocations: [
            [siteFolder, '']
        ],
        filters: [
            { exclude: (key: string) => key.split('/').some(n => n.startsWith('.')) || (siteFolder && !key.startsWith(`${siteFolder}/`) && !additionalFiles.contains(key)) },
        ],
    });
}