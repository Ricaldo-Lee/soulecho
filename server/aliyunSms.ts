/**
 * 阿里云号码认证服务（PNVS）— 发送短信验证码
 * 使用 SendSmsVerifyCode 接口，不依赖 Dysmsapi SendSms。
 */
import { createRequire } from 'node:module';
import { $OpenApiUtil } from '@alicloud/openapi-core';

const require = createRequire(import.meta.url);
const Dypns20170525 = require('@alicloud/dypnsapi20170525') as {
  default?: new (cfg: unknown) => {
    sendSmsVerifyCode: (req: unknown) => Promise<{
      body?: { code?: string; message?: string; success?: boolean };
    }>;
  };
  SendSmsVerifyCodeRequest?: new (data: Record<string, unknown>) => unknown;
};

export async function sendAliyunOtpSms(phoneE164: string, otp: string): Promise<void> {
  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  const signName = process.env.ALIYUN_SMS_SIGN_NAME;
  const templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE;

  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    throw new Error(
      '阿里云短信未配置：需要 ALIYUN_ACCESS_KEY_ID、ALIYUN_ACCESS_KEY_SECRET、ALIYUN_SMS_SIGN_NAME、ALIYUN_SMS_TEMPLATE_CODE',
    );
  }

  const DypnsClientCtor = Dypns20170525.default;
  if (!DypnsClientCtor) {
    throw new Error('PNVS SDK 加载失败：缺少 default Client 导出');
  }

  const config = new $OpenApiUtil.Config({ accessKeyId, accessKeySecret });
  // PNVS（号码认证服务）官方接口域名
  config.endpoint = 'dypnsapi.aliyuncs.com';

  const client = new DypnsClientCtor(config);
  const digits = phoneE164.replace(/\D/g, '');
  const mobile = digits.startsWith('86') ? digits.slice(2) : digits;

  if (!/^1\d{10}$/.test(mobile)) {
    throw new Error('仅支持中国大陆 11 位手机号发送验证码');
  }

  const ReqCtor = Dypns20170525.SendSmsVerifyCodeRequest;
  if (!ReqCtor) {
    throw new Error('PNVS SDK 加载失败：缺少 SendSmsVerifyCodeRequest 导出');
  }

  const req = new ReqCtor({
    countryCode: '86',
    phoneNumber: mobile,
    signName,
    templateCode,
    // 该模板同时要求 code 与 min；min 为有效分钟数
    templateParam: JSON.stringify({ code: otp, min: '5' }),
    validTime: 300,
    interval: 60,
    duplicatePolicy: 1,
    codeLength: otp.length,
  });

  const resp = await client.sendSmsVerifyCode(req);
  const code = resp.body?.code;
  const success = resp.body?.success;

  if (!(success && code === 'OK')) {
    throw new Error(
      `阿里云 PNVS SendSmsVerifyCode 失败: ${code ?? 'unknown'} ${resp.body?.message ?? ''}`,
    );
  }
}
