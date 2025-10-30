// Test script to list all available VS Code commands
const vscode = require('vscode');

async function listHoverCommands() {
    const commands = await vscode.commands.getCommands(true);
    const hoverRelated = commands.filter(cmd => 
        cmd.toLowerCase().includes('hover') || 
        cmd.toLowerCase().includes('close') ||
        cmd.toLowerCase().includes('hide')
    );
    console.log('Hover-related commands:', hoverRelated);
}
