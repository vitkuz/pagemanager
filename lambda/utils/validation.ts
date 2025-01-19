import { Node, Page } from '../types/common';

export const validateNode = (node: Partial<Node>): string[] => {
    const errors: string[] = [];

    if (!node.title?.trim()) {
        errors.push('Title is required');
    }

    if (!node.description?.trim()) {
        errors.push('Description is required');
    }

    if (!node.prompt?.trim()) {
        errors.push('Prompt is required');
    }

    return errors;
};

export const validatePage = (page: Partial<Page>): string[] => {
    const errors: string[] = [];

    if (!page.title?.trim()) {
        errors.push('Title is required');
    }

    if (typeof page.isPublished !== 'boolean') {
        errors.push('isPublished must be a boolean');
    }

    return errors;
};