import { ReconnectStorage } from '../../common/storage';
import { IConnectorConfigs } from '../../types/connector';
import { ConnectorError, ConnectorErrorType } from '../../types/connector-error';
import { EIP1193Event, IEIP1193Provider } from '../../types/eip1193';
import { numberToHex } from '../../utils';
import { BaseConnector } from '../base/BaseConnector';

export class InjectedConnector extends BaseConnector {
  readonly isRonin: boolean;
  protected provider: IEIP1193Provider;

  constructor(configs: IConnectorConfigs, provider: IEIP1193Provider) {
    super(configs);
    this.isRonin = !!provider.isRonin;
    this.provider = provider;
  }

  async connect(chainId?: number) {
    const provider = await this.getProvider();

    if (!provider) {
      throw new ConnectorError(ConnectorErrorType.PROVIDER_NOT_FOUND);
    }

    try {
      const accounts = await this.requestAccounts();
      const currentChainId = await this.getChainId();

      if (chainId && currentChainId !== chainId) {
        await this.switchChain(chainId);
      }

      const connectResults = {
        provider,
        chainId: chainId || currentChainId,
        account: accounts[0],
      };

      this.setupProviderListeners();
      this.onConnect(connectResults);
      ReconnectStorage.add(this.id);

      return connectResults;
    } catch (err) {
      throw new ConnectorError(ConnectorErrorType.CONNECT_FAILED, err);
    }
  }

  async disconnect() {
    this.onDisconnect();
    this.removeProviderListeners();
  }

  async isAuthorized() {
    const accounts = await this.getAccounts();
    return accounts.length > 0;
  }

  async getAccounts() {
    const provider = await this.getProvider();
    return provider.request<string[]>({
      method: 'eth_accounts',
    });
  }

  async switchChain(chain: number) {
    const provider = await this.getProvider();
    const chainId = provider?.request<number | string>({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: numberToHex(chain) }],
    });
    return !!chainId;
  }

  async getChainId() {
    const provider = await this.getProvider();
    const chainId = await provider?.request<number | string>({
      method: 'eth_chainId',
    });

    return Number(chainId);
  }

  async requestAccounts() {
    const provider = await this.getProvider();
    return provider?.request<string[]>({
      method: 'eth_requestAccounts',
    });
  }

  async requestProvider() {
    return this.provider;
  }

  protected setupProviderListeners() {
    if (this.provider) {
      this.provider.on(EIP1193Event.DISCONNECT, this.onDisconnect);
      this.provider.on(EIP1193Event.ACCOUNTS_CHANGED, this.onAccountsChanged);
      this.provider.on(EIP1193Event.CHAIN_CHANGED, this.onChainChanged);
    }
  }

  protected removeProviderListeners() {
    if (this.provider) {
      this.provider.removeListener(EIP1193Event.DISCONNECT, this.onDisconnect);
      this.provider.removeListener(EIP1193Event.ACCOUNTS_CHANGED, this.onAccountsChanged);
      this.provider.removeListener(EIP1193Event.CHAIN_CHANGED, this.onChainChanged);
    }
  }
}
