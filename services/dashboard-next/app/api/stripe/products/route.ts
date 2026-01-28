import { NextRequest, NextResponse } from 'next/server';
import { stripeStorage } from '@/lib/stripe/storage';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const withPrices = searchParams.get('withPrices') === 'true';
    const active = searchParams.get('active') !== 'false';
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (withPrices) {
      const rows = await stripeStorage.listProductsWithPrices(active, limit, offset);

      const productsMap = new Map();
      for (const row of rows as any[]) {
        if (!productsMap.has(row.product_id)) {
          productsMap.set(row.product_id, {
            id: row.product_id,
            name: row.product_name,
            description: row.product_description,
            active: row.product_active,
            metadata: row.product_metadata,
            prices: []
          });
        }
        if (row.price_id) {
          productsMap.get(row.product_id).prices.push({
            id: row.price_id,
            unit_amount: row.unit_amount,
            currency: row.currency,
            recurring: row.recurring,
            active: row.price_active,
            metadata: row.price_metadata,
          });
        }
      }

      return NextResponse.json({ data: Array.from(productsMap.values()) });
    }

    const products = await stripeStorage.listProducts(active, limit, offset);
    return NextResponse.json({ data: products });
  } catch (error: any) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch products' },
      { status: 500 }
    );
  }
}
