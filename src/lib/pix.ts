
export class PixPayload {
  private merchantName: string;
  private merchantCity: string;
  private pixKey: string;
  private amount: string;
  private txid: string;

  constructor(
    pixKey: string,
    merchantName: string,
    merchantCity: string,
    amount: string,
    txid: string = '***'
  ) {
    this.pixKey = pixKey;
    this.merchantName = merchantName;
    this.merchantCity = merchantCity;
    this.amount = amount;
    this.txid = txid;
  }

  private formatString(id: string, value: string): string {
    const len = value.length.toString().padStart(2, '0');
    return `${id}${len}${value}`;
  }

  private getMerchantAccountInformation(): string {
    const gui = this.formatString('00', 'BR.GOV.BCB.PIX');
    const key = this.formatString('01', this.pixKey);
    return this.formatString('26', `${gui}${key}`);
  }

  private getCRC16(payload: string): string {
    const payloadWithCRC = payload + '6304';
    let crc = 0xffff;
    const polynomial = 0x1021;

    for (let i = 0; i < payloadWithCRC.length; i++) {
      crc ^= payloadWithCRC.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = (crc << 1) ^ polynomial;
        } else {
          crc = crc << 1;
        }
      }
    }

    return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  }

  public getPayload(): string {
    const payload = [
      this.formatString('00', '01'), // Payload Format Indicator
      this.getMerchantAccountInformation(), // Merchant Account Information
      this.formatString('52', '0000'), // Merchant Category Code
      this.formatString('53', '986'), // Transaction Currency (BRL)
      this.amount ? this.formatString('54', parseFloat(this.amount).toFixed(2)) : '', // Transaction Amount
      this.formatString('58', 'BR'), // Country Code
      this.formatString('59', this.merchantName), // Merchant Name
      this.formatString('60', this.merchantCity), // Merchant City
      this.formatString('62', this.formatString('05', this.txid)), // Additional Data Field Template (TXID)
    ].join('');

    return `${payload}6304${this.getCRC16(payload)}`;
  }
}

export const generatePixCopyPaste = (
  pixKey: string,
  amount: number,
  merchantName: string = 'Recebedor',
  merchantCity: string = 'Cidade'
): string => {
  const pix = new PixPayload(
    pixKey,
    merchantName,
    merchantCity,
    amount.toString(),
    '***' // TXID
  );
  return pix.getPayload();
};
