import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone: ensure it starts with 880
    let normalizedPhone = phone.replace(/[^0-9]/g, "");
    if (normalizedPhone.startsWith("0")) {
      normalizedPhone = "880" + normalizedPhone.substring(1);
    }
    if (!normalizedPhone.startsWith("880")) {
      normalizedPhone = "880" + normalizedPhone;
    }

    const BULKSMS_API_KEY = Deno.env.get("BULKSMS_BD_API_KEY");
    if (!BULKSMS_API_KEY) {
      throw new Error("BULKSMS_BD_API_KEY is not configured");
    }

    const BULKSMS_SENDER_ID = Deno.env.get("BULKSMS_BD_SENDER_ID") || "8809617618686";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Delete old OTPs for this phone
    await supabase.from("phone_otps").delete().eq("phone", normalizedPhone);

    // Store OTP
    const { error: insertError } = await supabase.from("phone_otps").insert({
      phone: normalizedPhone,
      otp_code: otp,
      expires_at: expiresAt,
    });

    if (insertError) {
      throw new Error(`Failed to store OTP: ${insertError.message}`);
    }

    // Send SMS via BulkSMS BD
    const message = `Your login OTP is: ${otp}. Valid for 5 minutes.`;
    const smsUrl = `http://bulksmsbd.net/api/smsapi?api_key=${BULKSMS_API_KEY}&type=text&number=${normalizedPhone}&senderid=${BULKSMS_SENDER_ID}&message=${encodeURIComponent(message)}`;

    const smsResponse = await fetch(smsUrl);
    const smsResult = await smsResponse.text();

    console.log("BulkSMS BD response:", smsResult);

    return new Response(
      JSON.stringify({ success: true, message: "OTP sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error sending OTP:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
