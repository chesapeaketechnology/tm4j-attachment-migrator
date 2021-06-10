const fetch = require("node-fetch");
const HttpUtils = require("./httpUtils.js");
const fs = require("fs");
const FormData = require("form-data");

class ZephyrScaleApi {
  constructor(jiraSettings) {
    this.jiraSettings = jiraSettings;
    this.currentIssueIndex = 0;
    this.currentPage = 0;
    this.firstPageLoaded = false;
    this.pageSize = 200;
  }

  getIssueKey(issue, isZephyrScale) {
    if (isZephyrScale) {
      if (issue.customFields) {
        return issue.customFields[this.jiraSettings.issueKeyCustomField];
      }
    } else {
      return issue.key;
    }
  }

  async validate(isZephyrScale) {
    const response = await fetch(
      this._getTestUrl(isZephyrScale),
      HttpUtils.getAuthHeader(
        this.jiraSettings.user,
        this.jiraSettings.password
      )
    );
    const isValid = response.status == 200;
    if (!isValid) {
      console.log(await response.text());
    }
    return isValid;
  }

  async getNextIssue(isZephyrScale) {
    if (!this.issues) {
      await this._loadNextIssuePage(isZephyrScale);
    }

    if (this.currentIssueIndex >= this.issues.length) {
      let isEof = await this._loadNextIssuePage(isZephyrScale);
      if (isEof) {
        return;
      }
      this.currentIssueIndex = 0;
    }

    const issue = this.issues[this.currentIssueIndex];
    this.currentIssueIndex++;
    return issue;
  }

  async uploadAttachments(issueKey, testCaseKey, isZephyrScale) {
    let targetKey = isZephyrScale ? testCaseKey : issueKey;
    const attachedFiles = await this._getAttachedFiles(
      targetKey,
      isZephyrScale
    );
    const attachmentsDir = `./attachments/${issueKey}`;
    const files = fs.readdirSync(attachmentsDir);
    let newFilesToUpload = [];
    if (attachedFiles.length > 0) {
      newFilesToUpload = files.filter((file) => !attachedFiles.includes(file));
    } else {
      newFilesToUpload = files;
    }
    for (let file of newFilesToUpload) {
      await this._uploadAttachmentToIssue(
        targetKey,
        `${attachmentsDir}/${file}`,
        isZephyrScale
      );
    }
  }

  async _uploadAttachmentToIssue(issueKey, filePath, isZephyrScale) {
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));

    const reqHeadersObj = {
      method: "POST",
      body: formData,
      headers: formData.getHeaders(),
    };

    const authHeader = HttpUtils.getAuthHeader(
      this.jiraSettings.user,
      this.jiraSettings.password
    );
    reqHeadersObj.headers.Authorization = authHeader.headers.Authorization;

    if (!isZephyrScale) {
      Object.assign(reqHeadersObj.headers, { "X-Atlassian-Token": "no-check" });
    }

    const response = await fetch(
      this._getUploadAttachmentsUrl(issueKey, isZephyrScale),
      reqHeadersObj
    );

    const isValid = isZephyrScale
      ? response.status == 201
      : response.status == 200;

    if (!isValid) {
      console.log(await response.text());
      throw `Error uploading attachment ${filePath} to test case ${issueKey}`;
    }
  }

  async _loadNextIssuePage(isZephyrScale) {
    if (this.issues) {
      this.currentPage++;
    }
    if (this.issues && this.issues.length < this.pageSize) return true;
    await this._loadPage(isZephyrScale);
    return this.issues.length === 0;
  }

  async _loadPage(isZephyrScale) {
    const response = await fetch(
      this._getIssueSearchUrl(isZephyrScale),
      HttpUtils.getAuthHeader(
        this.jiraSettings.user,
        this.jiraSettings.password
      )
    );

    const isValid = response.status == 200;
    if (!isValid) {
      console.log(await response.text());
      throw "Error retrieving test cases";
    }

    this.issues = isZephyrScale
      ? await response.json()
      : (await response.json()).issues;
  }

  async _getAttachedFiles(issueKey, isZephyrScale) {
    const response = await fetch(
      this._getAttachmentsUrl(issueKey, isZephyrScale),
      HttpUtils.getAuthHeader(
        this.jiraSettings.user,
        this.jiraSettings.password
      )
    );

    var data = await response.json();
    const attachments = isZephyrScale ? data : data.fields.attachment;

    return attachments
      ? attachments.map((attachment) => attachment.filename)
      : [];
  }

  _getAttachmentsUrl(key, isZephyrScale) {
    return isZephyrScale
      ? `${this.jiraSettings.url}/rest/atm/1.0/testcase/${key}/attachments`
      : `${this.jiraSettings.url}/rest/api/2/issue/${key}`;
  }

  _getUploadAttachmentsUrl(key, isZephyrScale) {
    return isZephyrScale
      ? `${this.jiraSettings.url}/rest/atm/1.0/testcase/${key}/attachments`
      : `${this.jiraSettings.url}/rest/api/2/issue/${key}/attachments`;
  }

  _getTestUrl(isZephyrScale) {
    return isZephyrScale
      ? encodeURI(
          `${this.jiraSettings.url}/rest/atm/1.0/testcase/search?query=status = Deprecated&fields=id,key`
        )
      : `${this.jiraSettings.url}/rest/api/2/myself`;
  }

  _getIssueSearchUrl(isZephyrScale) {
    return isZephyrScale
      ? encodeURI(
          `${
            this.jiraSettings.url
          }/rest/atm/1.0/testcase/search?query=projectKey = \"${
            this.jiraSettings.projectKey
          }\"&fields=key,customFields&startAt=${
            this.pageSize * this.currentPage
          }&maxResults=${this.pageSize}`
        )
      : encodeURI(
          `${this.jiraSettings.url}/rest/api/2/search?jql=project = \"${
            this.jiraSettings.projectKey
          }\"&fields=key&startAt=${
            this.pageSize * this.currentPage
          }&maxResults=${this.pageSize}`
        );
  }
}

module.exports = ZephyrScaleApi;
