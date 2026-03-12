import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const merchantId = Deno.env.get('PAYSTATION_MERCHANT_ID');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!merchantId || !supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { invoice_number } = await req.json();

    if (!invoice_number) {
      return new Response(
        JSON.stringify({ success: false, error: 'invoice_number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify with PayStation
    const formData = new FormData();
    formData.append('invoice_number', invoice_number);

    const response = await fetch('https://api.paystation.com.bd/transaction-status', {
      method: 'POST',
      headers: { 'merchantId': merchantId },
      body: formData,
    });

    const data = await response.json();
    console.log('PayStation verify response:', JSON.stringify(data));

    if (data.status_code !== '200') {
      return new Response(
        JSON.stringify({ success: false, error: data.message || 'Verification failed', trx_status: 'failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const trxStatus = (data.data?.trx_status || '').toLowerCase();
    const trxId = data.data?.trx_id || '';
    const paymentMethod = data.data?.payment_method || '';

    // Update order in database using service role
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (trxStatus === 'success') {
      const { error } = await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          payment_trx_id: trxId,
          payment_method: paymentMethod,
          status: 'pending',
        })
        .eq('payment_invoice', invoice_number);

      if (error) {
        console.error('DB update error:', error);
      }

      // Also create a transaction record
      const { data: orderData } = await supabase
        .from('orders')
        .select('user_id, payment_amount, order_number')
        .eq('payment_invoice', invoice_number)
        .maybeSingle();

      if (orderData) {
        await supabase.from('transactions').insert({
          user_id: orderData.user_id,
          amount: orderData.payment_amount,
          type: 'payment',
          description: `Payment for order #${orderData.order_number} via ${paymentMethod}`,
          reference_id: trxId,
          status: 'completed',
        });

        // Notify user
        await supabase.from('notifications').insert({
          user_id: orderData.user_id,
          title: 'Payment Successful',
          message: `Your payment of ৳${orderData.payment_amount} for order #${orderData.order_number} was successful.`,
          type: 'payment',
        });
      }
    } else if (trxStatus === 'failed') {
      await supabase
        .from('orders')
        .update({ payment_status: 'failed' })
        .eq('payment_invoice', invoice_number);
    }

    return new Response(
      JSON.stringify({
        success: true,
        trx_status: trxStatus,
        trx_id: trxId,
        payment_method: paymentMethod,
        payment_amount: data.data?.payment_amount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('PayStation verify error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
