import { Message, MessageID } from "../messages/message.js";
import { Communicator, type CommunicatorOptions } from "./communicator.js";
import type { CommunicationAdapter } from "./interface.js";

/**
 * Web-based communication adapter that wraps the existing Communicator class.
 * Used as the default adapter for browser environments (popup window flow).
 */
export class WebCommunicationAdapter implements CommunicationAdapter {
  private readonly communicator: Communicator;

  constructor(options: CommunicatorOptions) {
    this.communicator = new Communicator(options);
  }

  async waitForReady(): Promise<void> {
    await this.communicator.waitForPopupLoaded();
  }

  async postRequestAndWaitForResponse<M extends Message>(
    request: Message & { id: MessageID },
  ): Promise<M> {
    return this.communicator.postRequestAndWaitForResponse<M>(request);
  }

  async postMessage(message: Message): Promise<void> {
    return this.communicator.postMessage(message);
  }

  async onMessage<M extends Message>(
    predicate: (msg: Partial<M>) => boolean,
  ): Promise<M> {
    return this.communicator.onMessage<M>(predicate);
  }

  disconnect(): void {
    this.communicator.disconnect();
  }
}
