"""Dashboard endpoints for the product catalogue (SAN-1800)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import delete, select

from .db import SessionLocal
from .deps import CurrentUser, get_current_user, require_workspace_role
from .models import Bot, Product
from .services import products as svc

router = APIRouter()


class ProductIn(BaseModel):
    name: str
    price: str = ""
    description: str = ""
    image_url: str = ""
    url: str = ""


def _out(p: Product) -> dict:
    return svc.to_card(p) | {"description": p.description}


async def _bot_for(session, bot_id: str, user: CurrentUser, min_role: str) -> Bot:
    bot = await session.get(Bot, bot_id)
    if bot is None:
        raise HTTPException(404, "Bot not found")
    await require_workspace_role(bot.workspace_id, user, min_role=min_role, session=session)
    return bot


async def _product_for(session, product_id: str, user: CurrentUser, min_role: str) -> Product:
    product = await session.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Product not found")
    await _bot_for(session, product.bot_id, user, min_role)
    return product


@router.get("/v1/bots/{bot_id}/products")
async def list_products(bot_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        await _bot_for(session, bot_id, user, "viewer")
        rows = (await session.execute(
            select(Product).where(Product.bot_id == bot_id).order_by(Product.created_at.desc(), Product.name)
        )).scalars().all()
        return [_out(p) for p in rows]


@router.post("/v1/bots/{bot_id}/products")
async def add_product(bot_id: str, body: ProductIn, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await _bot_for(session, bot_id, user, "admin")
        try:
            fields = svc.clean_fields(body.name, body.price, body.description, body.image_url, body.url)
        except svc.ProductError as e:
            raise HTTPException(422, str(e))
        if await svc.count_products(session, bot_id) >= svc.MAX_PRODUCTS_PER_BOT:
            raise HTTPException(400, f"At most {svc.MAX_PRODUCTS_PER_BOT} products per assistant")
        product = await svc.create_product(session, tenant_id=bot.tenant_id, bot_id=bot_id, **fields)
        await session.commit()
        return _out(product)


@router.put("/v1/products/{product_id}")
async def edit_product(product_id: str, body: ProductIn, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        product = await _product_for(session, product_id, user, "admin")
        try:
            fields = svc.clean_fields(body.name, body.price, body.description, body.image_url, body.url)
        except svc.ProductError as e:
            raise HTTPException(422, str(e))
        await svc.update_product(session, product, **fields)
        await session.commit()
        return _out(product)


@router.delete("/v1/products/{product_id}")
async def remove_product(product_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        product = await _product_for(session, product_id, user, "admin")
        await session.delete(product)
        await session.commit()
        return {"deleted": True}


@router.delete("/v1/bots/{bot_id}/products")
async def clear_products(bot_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        await _bot_for(session, bot_id, user, "admin")
        result = await session.execute(delete(Product).where(Product.bot_id == bot_id))
        await session.commit()
        return {"deleted": result.rowcount or 0}


@router.post("/v1/bots/{bot_id}/products/import")
async def import_products(bot_id: str, file: UploadFile = File(...), user: CurrentUser = Depends(get_current_user)):
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(400, "File is larger than 5 MB")
    async with SessionLocal() as session:
        bot = await _bot_for(session, bot_id, user, "admin")
        try:
            rows, problems = svc.parse_csv(raw)
            imported = await svc.import_rows(session, tenant_id=bot.tenant_id, bot_id=bot_id, rows=rows)
        except svc.ProductError as e:
            raise HTTPException(422, str(e))
        await session.commit()
        return {"imported": imported, "problems": problems[:20], "problem_count": len(problems)}
