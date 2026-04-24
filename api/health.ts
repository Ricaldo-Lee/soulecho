export default function handler(_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) {
  res.status(200).json({
    status: 'ok',
    source: 'vercel-health-function',
    time: new Date().toISOString(),
    config: {
      supabaseUrl: !!process.env.SUPABASE_URL?.trim(),
      supabaseServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
      deepseekApiKey: !!process.env.DEEPSEEK_API_KEY?.trim(),
      aliyunAccessKeyId: !!process.env.ALIYUN_ACCESS_KEY_ID?.trim(),
      aliyunAccessKeySecret: !!process.env.ALIYUN_ACCESS_KEY_SECRET?.trim(),
      otpPepper: !!process.env.PHONE_OTP_PEPPER?.trim(),
    },
  });
}
