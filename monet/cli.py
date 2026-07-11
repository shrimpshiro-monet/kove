# monet/cli.py
"""
Monet CLI — for power users who want to script edits.

Usage:
    monet vibe --raw curry.mp4 --music drip.mp3 --prompt "cinematic slow-mo, yellow text"
    monet engines list
    monet render --plan plan.json --engine freecut --out edit.mp4
    monet export --in edit.mp4 --platform tiktok
    monet analytics
"""
from __future__ import annotations
import asyncio
import json
import sys
import click
import shutil

from monet.engines.freecut.executor.types import ProjectSettings
from monet.engines.freecut.executor.asset_resolver import AssetResolver, AssetEntry
from monet.engines.freecut.executor.ffprobe import probe_duration
from monet.vibe.session import create_session
from monet.vibe.pipeline import plan_session, render_unison, finalize
from monet.export.exporter import export_for_platform
from monet.analytics.store import summary as analytics_summary
from monet.router.capabilities import ALL_ENGINES


@click.group()
def cli():
    pass


@cli.command()
@click.option("--raw", required=True, type=click.Path(exists=True))
@click.option("--music", type=click.Path(exists=True))
@click.option("--reference", type=click.Path(exists=True))
@click.option("--prompt", required=True)
@click.option("--engine", help="Force a specific engine (skip auto-pick)")
@click.option("--out", help="Output path for final cut")
def vibe(raw, music, reference, prompt, engine, out):
    """Full vibe-edit flow from CLI."""
    async def _run():
        s = create_session("cli_user")
        s.raw_footage_path = raw
        if music:
            s.music_path = music
        if reference:
            s.reference_path = reference
        s.prompt = prompt
        click.echo("🧠 planning…")
        hint = await plan_session(s)
        click.echo(f"✅ plan: {len(s.actions)} actions" + (f" (hint: {hint.notes})" if hint else ""))
        click.echo("🎬 rendering on all engines…")
        result = await render_unison(s, hint)
        click.echo(f"🏆 auto-winner: {result['winner']}")
        for e, score in result["scores"].items():
            click.echo(f"   {e:10}  overall={score.get('overall',0):.2f}  "
                       f"time={score.get('render_time_sec',0):.1f}s")
        final = await finalize(s, engine)
        if out:
            shutil.copy(final, out)
            final = out
        click.echo(f"✨ final: {final}")
    asyncio.run(_run())


@click.group()
def engines():
    pass

@engines.command("list")
def engines_list():
    """Show available engines + capabilities."""
    for e in ALL_ENGINES:
        click.echo(f"\n{click.style(e.name, fg='cyan', bold=True)}  cost={e.base_cost}")
        click.echo(f"  {e.notes}")
        for cap, score in sorted(e.supports.items(), key=lambda x: -x[1]):
            bar = "█" * int(score * 10)
            click.echo(f"    {cap.value:25} {bar:<10} {score:.2f}")


@cli.command()
@click.option("--in", "in_path", required=True, type=click.Path(exists=True))
@click.option("--platform", required=True,
              type=click.Choice(["tiktok", "reels", "shorts", "x_post", "youtube", "square"]))
@click.option("--out", help="Output path")
def export(in_path, platform, out):
    """Export an edit for a social platform."""
    async def _run():
        path = await export_for_platform(in_path, platform, out)
        click.echo(f"✅ exported: {path}")
    asyncio.run(_run())


@cli.command()
@click.option("--hours", default=168)
def analytics(hours):
    """Show engine performance over time."""
    s = analytics_summary(hours)
    click.echo(json.dumps(s, indent=2))


@cli.command()
@click.option("--plan", required=True, type=click.Path(exists=True))
@click.option("--assets", required=True, type=click.Path(exists=True),
              help="JSON file: [{mediaId, filePath, kind}]")
@click.option("--engine", default="freecut",
              type=click.Choice(["freecut", "editly", "opencut", "sam_vfx"]))
@click.option("--out", required=True)
def render(plan, assets, engine, out):
    """Render a pre-built plan with a specific engine."""
    from monet.engines.freecut.planner.parse_plan import parse_plan
    from monet.engines.freecut.executor.timeline_builder import build_timeline
    from monet.router.dispatch import _run_engine

    async def _run():
        plan_data = open(plan).read()
        actions = parse_plan(plan_data)
        assets_data = json.loads(open(assets).read())
        resolver = AssetResolver([AssetEntry(**a) for a in assets_data])
        settings = ProjectSettings()
        timeline = await build_timeline(actions, resolver, settings)
        result = await _run_engine(engine, actions, resolver, settings, timeline, out)
        click.echo(f"✅ rendered with {engine}: {result.outputPath}")
    asyncio.run(_run())


cli.add_command(engines)

if __name__ == "__main__":
    cli()
