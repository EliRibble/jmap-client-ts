import { Transport } from './utils/transport';
import {
  IEmailGetResponse,
  IEmailQueryResponse,
  IEmailSetResponse,
  IArguments,
  IMailboxGetResponse,
  IMailboxSetResponse,
  ISession,
  PushMessage,
  IEmailGetArguments,
  IMailboxGetArguments,
  IMailboxSetArguments,
  IMethodName,
  IReplaceableAccountId,
  IEmailQueryArguments,
  IEmailSetArguments,
  IMailboxChangesArguments,
  IMailboxChangesResponse,
  IEmailSubmissionSetArguments,
  IEmailSubmissionGetResponse,
  IEmailSubmissionGetArguments,
  IEmailSubmissionChangesArguments,
  IEmailSubmissionSetResponse,
  IEmailSubmissionChangesResponse,
  IEmailChangesArguments,
  IEmailChangesResponse,
  IInvocation,
  IUploadResponse,
  IEmailImportArguments,
  IEmailImportResponse,
  IThreadChangesArguments,
  IThreadChangesResponse,
  IThreadGetArguments,
  IThreadGetResponse,
} from './types';

export class Client {
  private readonly DEFAULT_USING = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'];

  private transport: Transport;
  private httpHeaders: { [headerName: string]: string };

  private sessionUrl: string;
  private overriddenApiUrl?: string;
  private session?: ISession;

  constructor({
    sessionUrl,
    accessToken,
    overriddenApiUrl,
    transport,
    httpHeaders,
  }: {
    sessionUrl: string;
    accessToken: string;
    overriddenApiUrl?: string;
    transport: Transport;
    httpHeaders?: { [headerName: string]: string };
  }) {
    this.sessionUrl = sessionUrl;
    if (overriddenApiUrl) {
      this.overriddenApiUrl = overriddenApiUrl;
    }
    this.transport = transport;
    this.httpHeaders = {
      Accept: 'application/json;jmapVersion=rfc-8621',
      Authorization: `Bearer ${accessToken}`,
      ...(httpHeaders ? httpHeaders : {}),
    };
  }

  public fetchSession(sessionHeaders?: { [headerName: string]: string }): Promise<void> {
    const requestHeaders = {
      ...this.httpHeaders,
      ...(sessionHeaders ? sessionHeaders : {}),
    };
    const sessionPromise = this.transport.get<ISession>(this.sessionUrl, requestHeaders);
    return sessionPromise.then(session => {
      this.session = session;
      return;
    });
  }

  public getSession(): ISession {
    if (!this.session) {
      throw new Error('Undefined session, should call fetchSession and wait for its resolution');
    }
    return this.session;
  }

  public getAccountIds(): string[] {
    const session = this.getSession();

    return Object.keys(session.accounts);
  }

  public getFirstAccountId(): string {
    const accountIds = this.getAccountIds();

    if (accountIds.length === 0) {
      throw new Error('No account available for this session');
    }

    return accountIds[0];
  }

  public mailbox_get(args: IMailboxGetArguments): Promise<IMailboxGetResponse> {
    return this.request<IMailboxGetResponse>('Mailbox/get', args);
  }

  public mailbox_changes(args: IMailboxChangesArguments): Promise<IMailboxChangesResponse> {
    return this.request<IMailboxChangesResponse>('Mailbox/changes', args);
  }

  public mailbox_set(args: IMailboxSetArguments): Promise<IMailboxSetResponse> {
    return this.request<IMailboxSetResponse>('Mailbox/set', args);
  }

  public email_get(args: IEmailGetArguments): Promise<IEmailGetResponse> {
    return this.request<IEmailGetResponse>('Email/get', args);
  }

  public email_changes(args: IEmailChangesArguments): Promise<IEmailChangesResponse> {
    return this.request<IEmailChangesResponse>('Email/changes', args);
  }

  public email_query(args: IEmailQueryArguments): Promise<IEmailQueryResponse> {
    return this.request<IEmailQueryResponse>('Email/query', args);
  }

  public email_set(args: IEmailSetArguments): Promise<IEmailSetResponse> {
    return this.request<IEmailSetResponse>('Email/set', args);
  }

  public email_import(args: IEmailImportArguments): Promise<IEmailImportResponse> {
    return this.request<IEmailImportResponse>('Email/import', args);
  }

  public thread_get(args: IThreadGetArguments): Promise<IThreadGetResponse> {
    return this.request<IThreadGetResponse>('Thread/get', args);
  }
  public thread_changes(args: IThreadChangesArguments): Promise<IThreadChangesResponse> {
    return this.request<IThreadChangesResponse>('Thread/changes', args);
  }

  public emailSubmission_get(
    args: IEmailSubmissionGetArguments,
  ): Promise<IEmailSubmissionGetResponse> {
    return this.request<IEmailSubmissionGetResponse>('EmailSubmission/get', args);
  }

  public emailSubmission_changes(
    args: IEmailSubmissionChangesArguments,
  ): Promise<IEmailSubmissionChangesResponse> {
    return this.request<IEmailSubmissionChangesResponse>('EmailSubmission/changes', args);
  }

  public emailSubmission_set(
    args: IEmailSubmissionSetArguments,
  ): Promise<IEmailSubmissionSetResponse> {
    return this.request<IEmailSubmissionSetResponse>('EmailSubmission/set', args);
  }

  public async subscribeToEvents(url: string, callback: (type: string, message: PushMessage) => void) {
    // const response = await this.transport.get<IStateChange>(url, this.httpHeaders);
    const response = await fetch(url, {headers: this.httpHeaders});
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    while (true) {
      const {value, done} = await reader.read();
      if (done) {
        console.log("Event stream done.");
        return;
      }
      // Gather data until we have two newlines, one for the 'event: <type>\n' the
      // other for the 'data: <data>\n' line.
      buffer = buffer + value;
      const lines = buffer.split("\n")
      if (lines.length < 2) {
	// console.log("Not enough lines in the buffer", lines.length);
        continue;
      }
      // Add 1 for each newline between the lines, and a final one for the separator newline
      buffer = buffer.substring(lines[0].length + 1 + lines[1].length + 2);
      let colonIndex = lines[0].indexOf(":");
      if (colonIndex === -1) {
        throw new Error("Missing correct event format in '" + lines[0] + "'. It should be 'event: <type>'");
      }
      const eventType = lines[0].substring(colonIndex+1).trim();
      colonIndex = lines[1].indexOf(":");
      if (colonIndex === -1) {
        throw new Error("Missing correct data format in '" + lines[1] + "'. It should be 'data: <data>'");
      }
      const data = JSON.parse(lines[1].substring(colonIndex+1));
      callback(eventType, data);
    }
  }
  public upload(buffer: ArrayBuffer, type = 'application/octet-stream'): Promise<IUploadResponse> {
    const uploadUrl = this.getSession().uploadUrl;
    const accountId = this.getFirstAccountId();
    const requestHeaders = {
      ...this.httpHeaders,
      'Content-Type': type,
    };
    return this.transport.post<IUploadResponse>(
      uploadUrl.replace('{accountId}', encodeURIComponent(accountId)),
      buffer,
      requestHeaders,
    );
  }

  private request<ResponseType>(methodName: IMethodName, args: IArguments) {
    const apiUrl = this.overriddenApiUrl || this.getSession().apiUrl;
    return this.transport
      .post<{
        sessionState: string;
        methodResponses: IInvocation<ResponseType>[];
      }>(
        apiUrl,
        {
          using: this.getCapabilities(),
          methodCalls: [[methodName, this.replaceAccountId(args), '0']],
        },
        this.httpHeaders,
      )
      .then(response => {
        const methodResponse = response.methodResponses[0];

        if (methodResponse[0] === 'error') {
          throw methodResponse[1];
        }

        return methodResponse[1];
      });
  }

  private replaceAccountId<U extends IReplaceableAccountId>(input: U): U {
    return input.accountId !== null
      ? input
      : {
          ...input,
          accountId: this.getFirstAccountId(),
        };
  }

  private getCapabilities() {
    return this.session?.capabilities ? Object.keys(this.session.capabilities) : this.DEFAULT_USING;
  }
}
