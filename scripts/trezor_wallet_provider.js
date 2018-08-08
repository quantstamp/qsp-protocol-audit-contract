var ProviderEngine = require("web3-provider-engine");
var FiltersSubprovider = require('web3-provider-engine/subproviders/filters.js');
var TrezorProvider = require("trezor-wallet-provider");
var Web3Subprovider = require("web3-provider-engine/subproviders/web3.js");
var Web3 = require("web3");

function TrezorWalletProvider(provider_url) {
  var engine = new ProviderEngine();
  engine.addProvider(new TrezorProvider("m/44'/60'/0'/0/"));
  engine.addProvider(new FiltersSubprovider());
  engine.addProvider(new Web3Subprovider(new Web3.providers.HttpProvider(provider_url)));
  engine.start();
};

TrezorWalletProvider.prototype.sendAsync = function() {
  this.engine.sendAsync.apply(this.engine, arguments);
};

TrezorWalletProvider.prototype.send = function() {
  return this.engine.send.apply(this.engine, arguments);
};

TrezorWalletProvider.prototype.getAddress = function() {
  return this.address;
};

module.exports = TrezorWalletProvider;
