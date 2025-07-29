import { AccountAddress } from "@aptos-labs/ts-sdk";

export function isAptosAddress(address: string): boolean {
  try {
    AccountAddress.fromString(address);
    return true;
  } catch (error) {
    console.log(`Invalid Aptos address: ${address}`, error);
    return false;
  }
}